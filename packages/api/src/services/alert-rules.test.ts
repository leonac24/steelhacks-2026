import { describe, expect, it } from "vitest";

import {
  buildCandidates,
  byPriority,
  checkDelivery,
  isQuietHour,
  type CandidateInput,
} from "./alert-rules";

const allRulesOn = {
  shortfall: { enabled: true, thresholdCents: null },
  bill_due_unfunded: { enabled: true, thresholdCents: null },
  unusual_txn: { enabled: true, thresholdCents: 10_000 },
  deposit_arrived: { enabled: true, thresholdCents: null },
};

const base: CandidateInput = {
  memberId: "m1",
  preferredName: "Dot",
  today: "2026-09-19",
  shortfall: { willShortfall: false, shortfallCents: 0, date: null },
  upcomingBills: [],
  newTransactions: [],
  transactionHistory: [
    { amountCents: 6_500, merchantName: "Giant Eagle" },
    { amountCents: 4_200, merchantName: "Giant Eagle" },
    { amountCents: 1_899, merchantName: "CVS Pharmacy" },
  ],
  rules: allRulesOn,
};

describe("buildCandidates", () => {
  it("returns nothing when everything is fine", () => {
    expect(buildCandidates(base)).toEqual([]);
  });

  it("raises a shortfall alert with a spoken amount", () => {
    const [alert] = buildCandidates({
      ...base,
      shortfall: { willShortfall: true, shortfallCents: 4_200, date: "2026-10-01" },
    });
    expect(alert?.dedupeKey).toBe("m1:shortfall:2026-10-01");
    expect(alert?.spokenMessage).toContain("You'd be forty-two dollars short");
  });

  it("warns only about uncovered bills due within three days", () => {
    const keys = buildCandidates({
      ...base,
      upcomingBills: [
        { name: "Rent", amountCents: 95_000, dueDate: "2026-09-21", covered: false },
        { name: "Phone", amountCents: 6_499, dueDate: "2026-09-21", covered: true },
        { name: "Water", amountCents: 4_200, dueDate: "2026-09-30", covered: false },
      ],
    }).map((c) => c.dedupeKey);
    expect(keys).toEqual(["m1:bill_due_unfunded:Rent:2026-09-21"]);
  });

  it("flags an unusual charge above the threshold", () => {
    const alerts = buildCandidates({
      ...base,
      newTransactions: [
        { id: "t1", amountCents: 40_000, merchantName: "Best Buy", date: "2026-09-19" },
      ],
    });
    expect(alerts[0]?.ruleType).toBe("unusual_txn");
    expect(alerts[0]?.dedupeKey).toBe("m1:unusual_txn:t1");
    expect(alerts[0]?.spokenMessage).toContain("four hundred dollars at Best Buy");
  });

  it("ignores charges below the member's threshold", () => {
    expect(
      buildCandidates({
        ...base,
        newTransactions: [
          { id: "t2", amountCents: 9_000, merchantName: "Some New Shop", date: "2026-09-19" },
        ],
      }),
    ).toEqual([]);
  });

  it("announces deposits", () => {
    const [alert] = buildCandidates({
      ...base,
      newTransactions: [
        { id: "t3", amountCents: -184_200, merchantName: "Social Security", date: "2026-09-19" },
      ],
    });
    expect(alert?.ruleType).toBe("deposit_arrived");
    expect(alert?.spokenMessage).toContain("one thousand eight hundred forty-two dollars");
  });

  it("stays quiet about rules the caretaker turned off", () => {
    expect(
      buildCandidates({
        ...base,
        shortfall: { willShortfall: true, shortfallCents: 4_200, date: "2026-10-01" },
        rules: { ...allRulesOn, shortfall: { enabled: false, thresholdCents: null } },
      }),
    ).toEqual([]);
  });

  it("puts an unfunded bill ahead of a deposit", () => {
    const sorted = buildCandidates({
      ...base,
      upcomingBills: [{ name: "Rent", amountCents: 95_000, dueDate: "2026-09-20", covered: false }],
      newTransactions: [
        { id: "t4", amountCents: -184_200, merchantName: "Social Security", date: "2026-09-19" },
      ],
    }).sort(byPriority);
    expect(sorted.map((c) => c.ruleType)).toEqual(["bill_due_unfunded", "deposit_arrived"]);
  });
});

describe("isQuietHour", () => {
  it("handles windows that wrap midnight", () => {
    expect(isQuietHour("21:30", "20:00", "09:00")).toBe(true);
    expect(isQuietHour("03:00", "20:00", "09:00")).toBe(true);
    expect(isQuietHour("09:00", "20:00", "09:00")).toBe(false);
    expect(isQuietHour("14:00", "20:00", "09:00")).toBe(false);
  });

  it("handles same-day windows and an empty window", () => {
    expect(isQuietHour("13:00", "12:00", "14:00")).toBe(true);
    expect(isQuietHour("15:00", "12:00", "14:00")).toBe(false);
    expect(isQuietHour("13:00", "09:00", "09:00")).toBe(false);
  });
});

describe("checkDelivery", () => {
  const ok = {
    localTime: "14:00",
    quietHoursStart: "20:00",
    quietHoursEnd: "09:00",
    callsPlacedToday: 0,
    maxCallsPerDay: 2,
    reminderMode: "call" as const,
  };

  it("allows a call in the afternoon", () => {
    expect(checkDelivery(ok)).toEqual({ deliver: true, channel: "call" });
  });

  it("refuses during quiet hours, at the daily cap, and when reminders are off", () => {
    expect(checkDelivery({ ...ok, localTime: "22:00" })).toEqual({
      deliver: false,
      reason: "quiet_hours",
    });
    expect(checkDelivery({ ...ok, callsPlacedToday: 2 })).toEqual({
      deliver: false,
      reason: "daily_limit",
    });
    expect(checkDelivery({ ...ok, reminderMode: "off" })).toEqual({
      deliver: false,
      reason: "reminders_off",
    });
  });

  it("reports sms mode as its own channel", () => {
    expect(checkDelivery({ ...ok, reminderMode: "sms" })).toEqual({
      deliver: true,
      channel: "sms",
    });
  });
});
