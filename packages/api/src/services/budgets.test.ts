import { monthRange } from "@steelhacks-2026/finance";
import { describe, expect, it } from "vitest";

import { mergeSpending } from "./budgets";

const month = monthRange("2026-09-20");
const budgets = [
  { category: "groceries", monthlyLimitCents: 25_000 },
  { category: "dining", monthlyLimitCents: 6_000 },
  { category: "pharmacy", monthlyLimitCents: 6_000 },
];

describe("mergeSpending", () => {
  it("matches spending to its budget", () => {
    const { budgets: progress } = mergeSpending(
      budgets,
      [
        { category: "groceries", totalCents: 18_000 },
        { category: "dining", totalCents: 7_200 },
      ],
      month,
    );
    expect(progress.map((p) => [p.category, p.spentCents, p.pace])).toEqual([
      ["groceries", 18_000, "on_track"],
      ["dining", 7_200, "exceeded"],
      ["pharmacy", 0, "under"],
    ]);
  });

  it("surfaces spending in categories with no budget, biggest first", () => {
    const { unbudgeted } = mergeSpending(
      budgets,
      [
        { category: "groceries", totalCents: 1_000 },
        { category: "shopping", totalCents: 4_000 },
        { category: "housing", totalCents: 95_000 },
      ],
      month,
    );
    // A typo like "grocerys" would show up here, spending outside its budget.
    expect(unbudgeted).toEqual([
      { category: "housing", totalCents: 95_000 },
      { category: "shopping", totalCents: 4_000 },
    ]);
  });

  it("totals only budgeted categories", () => {
    const { totals } = mergeSpending(
      budgets,
      [
        { category: "groceries", totalCents: 10_000 },
        { category: "housing", totalCents: 95_000 },
      ],
      month,
    );
    expect(totals.limitCents).toBe(37_000);
    expect(totals.spentCents).toBe(10_000);
  });

  it("copes with no budgets at all", () => {
    const result = mergeSpending([], [{ category: "dining", totalCents: 2_000 }], month);
    expect(result.budgets).toEqual([]);
    expect(result.totals.limitCents).toBe(0);
    expect(result.unbudgeted).toHaveLength(1);
  });
});
