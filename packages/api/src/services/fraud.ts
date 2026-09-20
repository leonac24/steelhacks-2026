// Flags possibly-fraudulent transactions (gift cards, wire transfers,
// amounts way outside the member's normal pattern — the classic elder-fraud
// red flags). Two layers: a handful of hardcoded rules that always fire
// (gift cards, large withdrawals) so the demo never depends on an LLM call
// succeeding, plus Gemini for everything subtler. Plain fetch, no SDK, so
// it's easy to swap providers. https://ai.google.dev/api/generate-content
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          transactionId: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["transactionId", "reason", "confidence"],
      },
    },
  },
  required: ["findings"],
};

export type FraudCandidate = {
  id: string;
  date: string;
  merchantName: string | null;
  category: string;
  amountCents: number;
};

export type FraudFinding = {
  transactionId: string;
  reason: string;
  confidence: "low" | "medium" | "high";
  // "danger" (red): a hard elder-fraud red flag — a gift card purchase, or
  // whatever Gemini itself flags. "warning" (yellow): just a big charge —
  // worth a look, not necessarily fraud on its own.
  severity: "warning" | "danger";
};

// Guaranteed catches, checked before Gemini ever gets involved — gift cards
// and large withdrawals over $3,000 are the only two hardcoded overrides the
// demo relies on being detected every time, not "most of the time an LLM
// agrees they're odd". Everything else goes through Gemini.
const GIFT_CARD_PATTERN = /gift[\s-]?card/i;
const LARGE_WITHDRAWAL_CENTS = 300_000; // $3,000+

function deterministicFindings(transactions: FraudCandidate[]): FraudFinding[] {
  const findings: FraudFinding[] = [];
  for (const t of transactions) {
    // Only charges (money out), never deposits.
    if (t.amountCents <= 0) continue;

    if (GIFT_CARD_PATTERN.test(t.merchantName ?? "")) {
      findings.push({
        transactionId: t.id,
        reason: `Gift card purchase at ${t.merchantName} — a classic elder-fraud request.`,
        confidence: "high",
        severity: "danger",
      });
      continue;
    }
    if (t.amountCents >= LARGE_WITHDRAWAL_CENTS) {
      findings.push({
        transactionId: t.id,
        reason: `Large charge of $${(t.amountCents / 100).toFixed(2)} at ${
          t.merchantName ?? "an unfamiliar merchant"
        }.`,
        confidence: "medium",
        severity: "warning",
      });
    }
  }
  return findings;
}

function buildPrompt(preferredName: string, transactions: FraudCandidate[]): string {
  const rows = transactions
    .map(
      (t) =>
        `- id=${t.id} date=${t.date} merchant="${t.merchantName ?? "unknown"}" category=${t.category} amount=$${(t.amountCents / 100).toFixed(2)}`,
    )
    .join("\n");
  return [
    `You help protect ${preferredName}, an older adult, from financial scams.`,
    "Review these recent bank transactions and flag ONLY the ones that look like elder-fraud red flags:",
    "gift card purchases, wire transfers, cryptocurrency, unusually large amounts for an unfamiliar merchant, or a sudden pattern break from their normal spending.",
    "Most transactions here are ordinary; only include genuinely suspicious ones. If none look suspicious, return an empty findings array.",
    "",
    "Transactions:",
    rows,
  ].join("\n");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini occasionally returns a transient 503/overload error under load —
// retry a couple of times with backoff before giving up, so a momentary
// spike doesn't silently drop every fraud check.
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [500, 1500];

async function callGemini(
  preferredName: string,
  transactions: FraudCandidate[],
): Promise<FraudFinding[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  // gemini-2.5-flash was retired; verified gemini-3.6-flash live against the
  // API on 2026-09-19. Re-check https://ai.google.dev/gemini-api/docs/models
  // if this starts 404ing again.
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: buildPrompt(preferredName, transactions) }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  });

  let res: Response | undefined;
  let bodyText = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) break;
    bodyText = await res.text();
    if (!RETRYABLE_STATUS.has(res.status) || attempt === RETRY_DELAYS_MS.length) break;
    await sleep(RETRY_DELAYS_MS[attempt]!);
  }
  if (!res!.ok) {
    throw new Error(`Gemini request failed (${res!.status}): ${bodyText}`);
  }

  const data = (await res!.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];

  const parsed = JSON.parse(text) as {
    findings?: Omit<FraudFinding, "severity">[];
  };
  // Never trust a hallucinated id back into the DB. Anything Gemini itself
  // flags is treated as a real red flag (severity "danger") — the softer
  // "warning" tier is reserved for the hardcoded large-charge rule.
  const validIds = new Set(transactions.map((t) => t.id));
  return (parsed.findings ?? [])
    .filter((f) => validIds.has(f.transactionId))
    .map((f) => ({ ...f, severity: "danger" as const }));
}

export async function detectFraud(input: {
  preferredName: string;
  transactions: FraudCandidate[];
}): Promise<FraudFinding[]> {
  if (input.transactions.length === 0) return [];

  const deterministic = deterministicFindings(input.transactions);
  const flaggedIds = new Set(deterministic.map((f) => f.transactionId));
  const remaining = input.transactions.filter((t) => !flaggedIds.has(t.id));

  if (remaining.length === 0) return deterministic;

  try {
    const modelFindings = await callGemini(input.preferredName, remaining);
    return [...deterministic, ...modelFindings];
  } catch (error) {
    // The hardcoded red flags are guaranteed regardless of Gemini's
    // availability; only let the error surface if we found nothing at all
    // (matches the old behavior for callers with no API key configured).
    if (deterministic.length > 0) return deterministic;
    throw error;
  }
}
