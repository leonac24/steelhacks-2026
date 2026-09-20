// Calls Gemini to flag possibly-fraudulent transactions (gift cards, wire
// transfers, amounts way outside the member's normal pattern — the classic
// elder-fraud red flags). Plain fetch, no SDK, so it's easy to swap providers.
// https://ai.google.dev/api/generate-content
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
};

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

// Throws if GEMINI_API_KEY isn't set; callers should catch and surface a
// clear "not configured" error rather than a raw fetch failure.
export async function detectFraud(input: {
  preferredName: string;
  transactions: FraudCandidate[];
}): Promise<FraudFinding[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  if (input.transactions.length === 0) return [];

  // gemini-2.5-flash was retired; verified gemini-3.6-flash live against the
  // API on 2026-09-19. Re-check https://ai.google.dev/gemini-api/docs/models
  // if this starts 404ing again.
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: buildPrompt(input.preferredName, input.transactions) }] },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];

  const parsed = JSON.parse(text) as { findings?: FraudFinding[] };
  // Never trust a hallucinated id back into the DB.
  const validIds = new Set(input.transactions.map((t) => t.id));
  return (parsed.findings ?? []).filter((f) => validIds.has(f.transactionId));
}
