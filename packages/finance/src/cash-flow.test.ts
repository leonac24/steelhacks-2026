import { describe, expect, it } from "vitest";

import { canAfford, projectShortfall, safeToSpend, type CashFlowInput } from "./cash-flow";

const base: CashFlowInput = {
  availableBalanceCents: 100_000, // $1,000
  upcomingBills: [
    { name: "Electric", amountCents: 9_000, dueDate: "2026-09-22" },
    { name: "Phone", amountCents: 6_000, dueDate: "2026-10-01" },
    { name: "Water", amountCents: 4_000, dueDate: "2026-10-03" }, // payday: counted
    { name: "Rent", amountCents: 80_000, dueDate: "2026-10-05" }, // after payday: ignored
    { name: "Old bill", amountCents: 1_000, dueDate: "2026-09-18" }, // past: ignored
  ],
  nextIncomeDate: "2026-10-03",
  today: "2026-09-19",
  bufferCents: 10_000,
};

describe("safeToSpend", () => {
  it("subtracts bills through payday and the buffer", () => {
    // 1000 - (90 + 60 + 40) - 100 = 710
    expect(safeToSpend(base)).toBe(71_000);
  });

  it("never goes below zero", () => {
    expect(safeToSpend({ ...base, availableBalanceCents: 5_000 })).toBe(0);
  });

  it("uses a 30-day horizon when next income is unknown", () => {
    // Rent on 10-05 is within 30 days now.
    expect(safeToSpend({ ...base, nextIncomeDate: null, availableBalanceCents: 200_000 })).toBe(
      200_000 - 9_000 - 6_000 - 4_000 - 80_000 - 10_000,
    );
  });

  it("rejects fractional cents", () => {
    expect(() => safeToSpend({ ...base, availableBalanceCents: 10.5 })).toThrow();
  });
});

describe("projectShortfall", () => {
  it("reports no shortfall when bills are covered", () => {
    expect(projectShortfall(base)).toEqual({ willShortfall: false, shortfallCents: 0, date: null });
  });

  it("finds the first date the balance goes negative and the total gap", () => {
    // 120 - 90 = 30, 30 - 60 = -30 on 10-01, -30 - 40 = -70
    expect(projectShortfall({ ...base, availableBalanceCents: 12_000 })).toEqual({
      willShortfall: true,
      shortfallCents: 7_000,
      date: "2026-10-01",
    });
  });

  it("ignores the safety buffer", () => {
    expect(projectShortfall({ ...base, availableBalanceCents: 19_000 }).willShortfall).toBe(false);
  });
});

describe("canAfford", () => {
  it("says yes when the buffer stays intact", () => {
    expect(canAfford(6_000, base)).toEqual({
      answer: "yes",
      remainingAfter: 100_000 - 19_000 - 6_000,
      nextIncomeDate: "2026-10-03",
    });
  });

  it("says yes_but_tight when it dips into the buffer", () => {
    // After bills: 810. Spending 750 leaves 60, under the 100 buffer.
    expect(canAfford(75_000, base).answer).toBe("yes_but_tight");
  });

  it("says no when a bill would go unpaid", () => {
    const result = canAfford(85_000, base);
    expect(result.answer).toBe("no");
    expect(result.remainingAfter).toBe(-4_000);
  });

  it("treats spending exactly down to the buffer as yes", () => {
    expect(canAfford(71_000, base).answer).toBe("yes");
  });
});
