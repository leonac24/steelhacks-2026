import { afterEach, describe, expect, it, vi } from "vitest";

import { detectFraud, type FraudCandidate } from "./fraud";

const txn = (overrides: Partial<FraudCandidate>): FraudCandidate => ({
  id: "t1",
  date: "2026-09-20",
  merchantName: "Giant Eagle",
  category: "groceries",
  amountCents: 4_500,
  ...overrides,
});

// Stubs a Gemini response that finds nothing — used for cases the
// deterministic rules also shouldn't catch, so we're testing the merged
// result with Gemini actually configured, not just its absence.
function stubGeminiFindingNothing() {
  process.env.GEMINI_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ findings: [] }) }] } }],
        }),
        { status: 200 },
      ),
    ),
  );
}

describe("detectFraud — deterministic rules", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("always flags gift card purchases, even without Gemini configured", async () => {
    const findings = await detectFraud({
      preferredName: "Dot",
      transactions: [txn({ id: "gc1", merchantName: "QuikCash Gift Cards", amountCents: 40_000 })],
    });
    expect(findings).toEqual([
      expect.objectContaining({ transactionId: "gc1", confidence: "high", severity: "danger" }),
    ]);
  });

  it("always flags large withdrawals ($3,000+) as a warning, even without Gemini configured", async () => {
    const findings = await detectFraud({
      preferredName: "Dot",
      transactions: [txn({ id: "big1", merchantName: "Unknown Merchant", amountCents: 350_000 })],
    });
    expect(findings).toEqual([
      expect.objectContaining({ transactionId: "big1", severity: "warning" }),
    ]);
  });

  it("doesn't flag charges under the $3,000 large-withdrawal floor", async () => {
    stubGeminiFindingNothing();
    const findings = await detectFraud({
      preferredName: "Dot",
      transactions: [txn({ id: "ok1", amountCents: 40_000 })],
    });
    expect(findings).toEqual([]);
  });

  it("doesn't flag ordinary small charges", async () => {
    stubGeminiFindingNothing();
    const findings = await detectFraud({
      preferredName: "Dot",
      transactions: [txn({ id: "ok1" })],
    });
    expect(findings).toEqual([]);
  });

  it("doesn't flag deposits (negative amounts), even if large", async () => {
    stubGeminiFindingNothing();
    const findings = await detectFraud({
      preferredName: "Dot",
      transactions: [txn({ id: "dep1", merchantName: "Social Security", amountCents: -184_200 })],
    });
    expect(findings).toEqual([]);
  });

  it("still returns the guaranteed finding when Gemini is unreachable", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    // A non-retryable status so this test doesn't sit through the real
    // backoff delays — the retry path itself isn't what's under test here.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));
    const findings = await detectFraud({
      preferredName: "Dot",
      transactions: [
        txn({ id: "gc1", merchantName: "QuikCash Gift Cards", amountCents: 40_000 }),
        txn({ id: "ok1" }),
      ],
    });
    expect(findings).toEqual([
      expect.objectContaining({ transactionId: "gc1", confidence: "high", severity: "danger" }),
    ]);
  });
});
