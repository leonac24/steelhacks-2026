import { describe, expect, it } from "vitest";

import type { TransactionRow } from "../providers/types";
import { evaluateAlertConditions, isWithinQuietHours } from "./alerts";

const memberId = "m1";
const base = {
  memberId,
  preferredName: "Dot",
  today: "2026-09-19",
  summary: {
    availableBalanceCents: 50_000,
    safeToSpendCents: 0,
    shortfall: { willShortfall: true, shortfallCents: 49_200, date: "2026-10-01" },
    upcomingBills: [],
    nextIncome: { name: "Social Security", amountCents: 184_200, date: "2026-10-03" },
  },
  upcomingBillStreams: [
    {
      id: "stream-rent",
      name: "Oakmont Senior Apartments",
      averageAmountCents: 95_000,
      nextExpectedDate: "2026-09-22",
    },
    {
      id: "stream-water",
      name: "Pennsylvania American Water",
      averageAmountCents: 4_200,
      nextExpectedDate: "2026-09-20",
    },
    {
      id: "stream-late",
      name: "Verizon Wireless",
      averageAmountCents: 6_499,
      nextExpectedDate: "2026-10-10",
    },
  ],
  historyTransactions: [
    { amountCents: 6_000, merchantName: "Giant Eagle" },
    { amountCents: 25_000, merchantName: "Giant Eagle" },
    { amountCents: 3_000, merchantName: "CVS Pharmacy" },
  ],
  rules: [
    { type: "shortfall", enabled: true, thresholdCents: null },
    { type: "bill_due_unfunded", enabled: true, thresholdCents: null },
    { type: "unusual_txn", enabled: true, thresholdCents: 10_000 },
    { type: "deposit_arrived", enabled: true, thresholdCents: null },
  ],
} as const;

function txn(t: Partial<TransactionRow> & Pick<TransactionRow, "id" | "amountCents" | "date">) {
  return { pending: false, merchantName: null, ...t } as TransactionRow;
}

describe("evaluateAlertConditions", () => {
  it("builds dedupe keys and reasons for every firing rule", () => {
    const candidates = evaluateAlertConditions({
      ...base,
      recentTransactions: [
        txn({ id: "t-gift", amountCents: 25_000, merchantName: "QuickCash Gift Cards", date: "2026-09-19" }),
        txn({ id: "t-dep", amountCents: -184_200, merchantName: "Social Security", date: "2026-09-17" }),
        txn({ id: "t-normal", amountCents: 6_000, merchantName: "Giant Eagle", date: "2026-09-18" }),
      ],
    });

    expect(candidates.map((c) => c.ruleType)).toEqual([
      "shortfall",
      "bill_due_unfunded",
      "unusual_txn",
      "deposit_arrived",
    ]);

    const shortfall = candidates.find((c) => c.ruleType === "shortfall")!;
    expect(shortfall.dedupeKey).toBe(`${memberId}:shortfall:2026-10-03`);

    const bill = candidates.find((c) => c.ruleType === "bill_due_unfunded")!;
    expect(bill.dedupeKey).toBe(`${memberId}:bill:stream-rent:2026-09-22`);

    const unusual = candidates.find((c) => c.ruleType === "unusual_txn")!;
    expect(unusual.dedupeKey).toBe(`${memberId}:unusual:t-gift`);

    const deposit = candidates.find((c) => c.ruleType === "deposit_arrived")!;
    expect(deposit.dedupeKey).toBe(`${memberId}:deposit:t-dep`);
  });

  it("only flags bill streams that are underfunded and inside the 7-day window", () => {
    const candidates = evaluateAlertConditions({
      ...base,
      recentTransactions: [],
    });
    const bills = candidates.filter((c) => c.ruleType === "bill_due_unfunded");
    // rent (95k > 50k balance) fires; water (4.2k < 50k) and late (beyond 7d) don't.
    expect(bills.map((c) => c.dedupeKey)).toEqual([`${memberId}:bill:stream-rent:2026-09-22`]);
  });

  it("respects the enabled flag per rule", () => {
    const candidates = evaluateAlertConditions({
      ...base,
      rules: base.rules.map((r) => ({ ...r, enabled: r.type !== "shortfall" })),
      recentTransactions: [],
    });
    expect(candidates.some((c) => c.ruleType === "shortfall")).toBe(false);
    expect(candidates.some((c) => c.ruleType === "bill_due_unfunded")).toBe(true);
  });

  it("keeps amounts and merchants out of the pre-PIN first message", () => {
    const candidates = evaluateAlertConditions({
      ...base,
      recentTransactions: [
        txn({ id: "t-gift", amountCents: 25_000, merchantName: "QuickCash Gift Cards", date: "2026-09-19" }),
      ],
    });
    const unusual = candidates.find((c) => c.ruleType === "unusual_txn")!;
    expect(unusual.firstMessage).not.toMatch(/25|\$|QuickCash|Gift/);
    expect(unusual.firstMessage).toContain("could you tell me your PIN?");
    expect(unusual.dynamicVariables).toMatchObject({
      identified: "yes",
      member_preferred_name: "Dot",
      call_direction: "outbound",
      call_reason: "unusual_transaction",
    });
    expect(unusual.dynamicVariables.alert_detail).toContain("QuickCash Gift Cards");
  });
});

describe("isWithinQuietHours", () => {
  it("handles a window that wraps midnight (20:00–09:00)", () => {
    expect(isWithinQuietHours("22:30", "20:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("00:30", "20:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("12:00", "20:00", "09:00")).toBe(false);
  });

  it("handles boundary minutes inclusively at start and exclusively at end", () => {
    expect(isWithinQuietHours("20:00", "20:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("08:59", "20:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("09:00", "20:00", "09:00")).toBe(false);
  });

  it("handles a same-day window that doesn't wrap", () => {
    expect(isWithinQuietHours("12:00", "09:00", "17:00")).toBe(true);
    expect(isWithinQuietHours("18:00", "09:00", "17:00")).toBe(false);
  });

  it("treats an empty window as never quiet", () => {
    expect(isWithinQuietHours("12:00", "09:00", "09:00")).toBe(false);
  });
});