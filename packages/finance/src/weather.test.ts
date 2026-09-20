import { describe, expect, it } from "vitest";

import {
  nextBriefingDate,
  isBriefingDue,
  buildFinancialWeather,
  daysUntil,
  weekdayName,
} from "./weather";

describe("buildFinancialWeather", () => {
  // Sunday, 2026-09-13. Mirrors the pitch: on track, groceries ran high,
  // Social Security lands Thursday (2026-09-17).
  it("reads like the product pitch", () => {
    const briefing = buildFinancialWeather({
      today: "2026-09-13",
      budgets: [
        { category: "groceries", limitCents: 25_000, spentCents: 20_000 },
        { category: "dining", limitCents: 6_000, spentCents: 2_000 },
        { category: "pharmacy", limitCents: 6_000, spentCents: 1_500 },
      ],
      nextIncome: { name: "Social Security", amountCents: 184_200, date: "2026-09-17" },
      shortfallDate: null,
    });
    expect(briefing.spoken).toBe(
      "Good morning. Groceries ran a little high this month. Your Social Security deposit lands on Thursday.",
    );
  });

  it("says you're on track when nothing is over the pace", () => {
    const briefing = buildFinancialWeather({
      today: "2026-09-16",
      budgets: [
        { category: "groceries", limitCents: 25_000, spentCents: 9_000 },
        { category: "dining", limitCents: 6_000, spentCents: 3_000 },
      ],
      nextIncome: null,
      shortfallDate: null,
    });
    expect(briefing.sentences).toContain("You're on track this month.");
  });

  it("calls out the worst (exceeded) budget instead of the overall take", () => {
    const briefing = buildFinancialWeather({
      today: "2026-09-16",
      budgets: [
        { category: "groceries", limitCents: 25_000, spentCents: 30_000 },
        { category: "dining", limitCents: 6_000, spentCents: 5_900 },
      ],
      nextIncome: null,
      shortfallDate: null,
    });
    expect(briefing.sentences).toContain("Groceries ran over its budget this month.");
  });

  it("drops the income sentence when it landed in the past", () => {
    const briefing = buildFinancialWeather({
      today: "2026-09-16",
      budgets: [],
      nextIncome: null,
      shortfallDate: null,
    });
    expect(briefing.spoken).toBe("Good morning.");
  });

  it("phrases the deposit by relative day", () => {
    const make = (today: string, date: string) =>
      buildFinancialWeather({
        today,
        budgets: [],
        nextIncome: { name: "Social Security", amountCents: 184_200, date },
        shortfallDate: null,
      });

    expect(make("2026-09-17", "2026-09-17").sentences).toContain(
      "Your Social Security deposit lands today.",
    );
    expect(make("2026-09-16", "2026-09-17").sentences).toContain(
      "Your Social Security deposit lands tomorrow.",
    );
    expect(make("2026-09-13", "2026-09-17").sentences).toContain(
      "Your Social Security deposit lands on Thursday.",
    );
    expect(make("2026-09-10", "2026-09-17").sentences).toContain(
      "Your Social Security deposit lands in 7 days.",
    );
  });

  it("adds a shortfall heads-up when the balance projects below zero", () => {
    const briefing = buildFinancialWeather({
      today: "2026-09-16",
      budgets: [],
      nextIncome: { name: "Social Security", amountCents: 184_200, date: "2026-09-20" },
      shortfallDate: "2026-09-18",
    });
    expect(briefing.sentences).toContain(
      "Heads up: your money may run short before your next deposit.",
    );
  });
});

describe("isBriefingDue / nextBriefingDate", () => {
  it("is always due before the first send", () => {
    expect(isBriefingDue(null, "weekly", "2026-09-16")).toBe(true);
    expect(isBriefingDue(null, "daily", "2026-09-16")).toBe(true);
  });

  it("weekly means a full 7 days between briefings", () => {
    expect(isBriefingDue("2026-09-09", "weekly", "2026-09-15")).toBe(false);
    expect(isBriefingDue("2026-09-09", "weekly", "2026-09-16")).toBe(true);
  });

  it("daily means the next calendar day", () => {
    expect(isBriefingDue("2026-09-15", "daily", "2026-09-15")).toBe(false);
    expect(isBriefingDue("2026-09-15", "daily", "2026-09-16")).toBe(true);
  });

  it("lazy weekly: a late send catches up instead of waiting for a weekday", () => {
    expect(nextBriefingDate("2026-09-01", "weekly", "2026-09-10")).toBe("2026-09-10");
    expect(nextBriefingDate("2026-09-15", "daily", "2026-09-16")).toBe("2026-09-16");
  });
});

describe("date helpers", () => {
  it("names weekdays and counts days", () => {
    expect(weekdayName("2026-09-17")).toBe("Thursday");
    expect(daysUntil("2026-09-16", "2026-09-20")).toBe(4);
  });
});
