import { describe, expect, it } from "vitest";

import { budgetStatus, monthRange } from "./budget-progress";

describe("monthRange", () => {
  it("covers the whole calendar month", () => {
    expect(monthRange("2026-09-19")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      daysInMonth: 30,
      dayOfMonth: 19,
    });
  });

  it("handles February in a leap year", () => {
    expect(monthRange("2028-02-10")).toMatchObject({ to: "2028-02-29", daysInMonth: 29 });
  });
});

describe("budgetStatus", () => {
  // Two thirds through a 30-day month.
  const month = monthRange("2026-09-20");

  it("counts what's left", () => {
    const status = budgetStatus(25_000, 10_000, month);
    expect(status.remainingCents).toBe(15_000);
    expect(status.percentUsed).toBe(40);
  });

  it("calls spending that matches the calendar on track", () => {
    expect(budgetStatus(30_000, 20_000, month).pace).toBe("on_track");
  });

  it("flags spending faster than the month passes", () => {
    expect(budgetStatus(30_000, 28_000, month).pace).toBe("over");
  });

  it("flags a blown budget even late in the month", () => {
    const status = budgetStatus(10_000, 12_500, month);
    expect(status.pace).toBe("exceeded");
    expect(status.remainingCents).toBe(-2_500);
  });

  it("calls a slow month under", () => {
    expect(budgetStatus(30_000, 5_000, month).pace).toBe("under");
  });

  it("projects the month-end total from the current pace", () => {
    // $200 spent by day 20 of 30 → about $300 by month end.
    expect(budgetStatus(30_000, 20_000, month).projectedCents).toBe(30_000);
  });

  it("handles a zero limit", () => {
    expect(budgetStatus(0, 0, month)).toMatchObject({ percentUsed: 0, pace: "on_track" });
    expect(budgetStatus(0, 500, month)).toMatchObject({ percentUsed: 100, pace: "exceeded" });
  });

  it("rejects fractional cents", () => {
    expect(() => budgetStatus(1_000.5, 0, month)).toThrow();
  });
});
