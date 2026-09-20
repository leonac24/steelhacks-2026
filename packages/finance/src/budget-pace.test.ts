import { describe, expect, it } from "vitest";

import { projectBudgetPace } from "./budget-pace";

describe("projectBudgetPace", () => {
  it("flags a budget already over its limit", () => {
    const result = projectBudgetPace({
      spentCents: 30_000,
      limitCents: 25_000,
      monthStart: "2026-09-01",
      today: "2026-09-10",
    });
    expect(result.alreadyExceeded).toBe(true);
    expect(result.onPaceToExceedByEndOfWeek).toBe(true);
  });

  it("projects a budget that will blow past its limit by Sunday", () => {
    // Wednesday 2026-09-16: $150 spent in 5 days (day 1 = the 12th) -> $30/day.
    // End of week is Sunday the 20th, 4 days out, so +$120 projected -> $270.
    const result = projectBudgetPace({
      spentCents: 15_000,
      limitCents: 20_000,
      monthStart: "2026-09-12",
      today: "2026-09-16",
    });
    expect(result.endOfWeek).toBe("2026-09-20");
    expect(result.projectedCents).toBe(27_000);
    expect(result.alreadyExceeded).toBe(false);
    expect(result.onPaceToExceedByEndOfWeek).toBe(true);
  });

  it("leaves a slow-pace budget alone", () => {
    const result = projectBudgetPace({
      spentCents: 5_000,
      limitCents: 25_000,
      monthStart: "2026-09-01",
      today: "2026-09-16",
    });
    expect(result.alreadyExceeded).toBe(false);
    expect(result.onPaceToExceedByEndOfWeek).toBe(false);
  });

  it("treats today itself as the end of week on a Sunday", () => {
    const result = projectBudgetPace({
      spentCents: 10_000,
      limitCents: 20_000,
      monthStart: "2026-09-01",
      today: "2026-09-20", // a Sunday
    });
    expect(result.endOfWeek).toBe("2026-09-20");
    expect(result.projectedCents).toBe(10_000);
  });
});
