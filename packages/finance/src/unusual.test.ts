import { describe, expect, it } from "vitest";

import { isUnusualTransaction, type TxnLike } from "./unusual";

const history: TxnLike[] = [
  { amountCents: 6_500, merchantName: "Giant Eagle" },
  { amountCents: 4_200, merchantName: "Giant Eagle" },
  { amountCents: 1_899, merchantName: "CVS Pharmacy" },
  { amountCents: 9_000, merchantName: "Duquesne Light" },
  { amountCents: 70_000, merchantName: "Oakmont Apartments" },
  { amountCents: -184_200, merchantName: "Social Security" }, // income is ignored
];

describe("isUnusualTransaction", () => {
  it("passes an ordinary grocery trip", () => {
    expect(
      isUnusualTransaction({ amountCents: 5_800, merchantName: "Giant Eagle" }, history),
    ).toEqual({ unusual: false, reasons: [] });
  });

  it("flags a large purchase at a new merchant", () => {
    const result = isUnusualTransaction({ amountCents: 40_000, merchantName: "Best Buy" }, history);
    expect(result.unusual).toBe(true);
    expect(result.reasons).toEqual(["large_amount", "new_merchant"]);
  });

  it("does not flag a usual large bill at its usual size", () => {
    expect(
      isUnusualTransaction({ amountCents: 70_000, merchantName: "Oakmont Apartments" }, history)
        .unusual,
    ).toBe(false);
  });

  it("flags gift-card merchants even for small amounts", () => {
    const result = isUnusualTransaction(
      { amountCents: 2_500, merchantName: "GOOGLE PLAY GIFT CARD" },
      history,
    );
    expect(result.reasons).toContain("gift_card_like");
  });

  it("ignores small purchases at new merchants", () => {
    expect(
      isUnusualTransaction({ amountCents: 1_200, merchantName: "Corner Cafe" }, history).unusual,
    ).toBe(false);
  });

  it("matches merchants loosely", () => {
    expect(
      isUnusualTransaction({ amountCents: 6_000, merchantName: "GIANT-EAGLE #123" }, history)
        .reasons,
    ).not.toContain("new_merchant");
  });

  it("never flags incoming money", () => {
    expect(
      isUnusualTransaction({ amountCents: -500_000, merchantName: "Bitcoin ATM" }, history),
    ).toEqual({ unusual: false, reasons: [] });
  });

  it("doesn't call anything new when there's no history", () => {
    expect(
      isUnusualTransaction({ amountCents: 6_000, merchantName: "Giant Eagle" }, []).unusual,
    ).toBe(false);
  });
});
