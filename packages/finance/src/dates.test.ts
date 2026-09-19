import { describe, expect, it } from "vitest";

import { addDays, nextDayOfMonth, todayInTimezone } from "./dates";

describe("dates", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-09-29", 3)).toBe("2026-10-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the next day of month after a date", () => {
    expect(nextDayOfMonth("2026-09-19", 3)).toBe("2026-10-03");
    expect(nextDayOfMonth("2026-09-19", 20)).toBe("2026-09-20");
    expect(nextDayOfMonth("2026-09-20", 20)).toBe("2026-10-20");
    expect(nextDayOfMonth("2026-09-19", 31)).toBe("2026-09-30");
    expect(nextDayOfMonth("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("uses the member's timezone for today", () => {
    const lateNightUtc = new Date("2026-09-20T02:30:00Z");
    expect(todayInTimezone("America/New_York", lateNightUtc)).toBe("2026-09-19");
    expect(todayInTimezone("UTC", lateNightUtc)).toBe("2026-09-20");
  });
});
