import { describe, expect, it } from "vitest";

import { computeCashPicture } from "./member-summary";

const streams = [
  {
    kind: "income" as const,
    name: "Social Security",
    averageAmountCents: 184_200,
    nextExpectedDate: "2026-10-03",
  },
  {
    kind: "bill" as const,
    name: "Rent",
    averageAmountCents: 95_000,
    nextExpectedDate: "2026-10-01",
  },
  {
    kind: "bill" as const,
    name: "Water",
    averageAmountCents: 4_200,
    nextExpectedDate: "2026-09-20",
  },
  {
    kind: "bill" as const,
    name: "Phone",
    averageAmountCents: 6_499,
    nextExpectedDate: "2026-10-08",
  },
  {
    kind: "bill" as const,
    name: "Stale",
    averageAmountCents: 1_000,
    nextExpectedDate: "2026-09-01",
  },
  { kind: "bill" as const, name: "Unknown", averageAmountCents: 1_000, nextExpectedDate: null },
];

describe("computeCashPicture", () => {
  it("lists upcoming bills in order and marks which are covered", () => {
    const picture = computeCashPicture({
      today: "2026-09-19",
      availableBalanceCents: 100_000,
      safetyBufferCents: 10_000,
      streams,
    });
    expect(picture.upcomingBills.map((b) => [b.name, b.covered])).toEqual([
      ["Water", true],
      ["Rent", true],
      ["Phone", false],
    ]);
    expect(picture.nextIncome).toEqual({
      name: "Social Security",
      amountCents: 184_200,
      date: "2026-10-03",
    });
  });

  it("only reserves bills due before the next income", () => {
    const picture = computeCashPicture({
      today: "2026-09-19",
      availableBalanceCents: 127_982,
      safetyBufferCents: 10_000,
      streams,
    });
    // 1279.82 - water 42 - rent 950 - buffer 100 (phone is after payday)
    expect(picture.safeToSpendCents).toBe(18_782);
    expect(picture.shortfall.willShortfall).toBe(false);
  });

  it("projects a shortfall when rent isn't covered", () => {
    const picture = computeCashPicture({
      today: "2026-09-19",
      availableBalanceCents: 50_000,
      safetyBufferCents: 10_000,
      streams,
    });
    expect(picture.safeToSpendCents).toBe(0);
    expect(picture.shortfall).toEqual({
      willShortfall: true,
      shortfallCents: 49_200,
      date: "2026-10-01",
    });
  });
});
