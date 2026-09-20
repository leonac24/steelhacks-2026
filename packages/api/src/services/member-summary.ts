import type { Database } from "@steelhacks-2026/db";
import {
  activityLog,
  bankAccount,
  member,
  memberSettings,
  recurringStream,
} from "@steelhacks-2026/db/schema/index";
import {
  addDays,
  projectShortfall,
  safeToSpend,
  todayInTimezone,
  type CashFlowInput,
  type IsoDate,
  type ShortfallProjection,
} from "@steelhacks-2026/finance";
import { and, desc, eq } from "drizzle-orm";

export const UPCOMING_BILL_DAYS = 30;

type Stream = {
  kind: "bill" | "income";
  name: string;
  averageAmountCents: number;
  nextExpectedDate: string | null;
};

export type UpcomingBill = {
  name: string;
  amountCents: number;
  dueDate: IsoDate;
  // True if the available balance covers this bill and every one before it.
  covered: boolean;
};

export type MemberSummary = {
  memberId: string;
  preferredName: string;
  today: IsoDate;
  availableBalanceCents: number;
  currentBalanceCents: number;
  safetyBufferCents: number;
  safeToSpendCents: number;
  upcomingBills: UpcomingBill[];
  nextIncome: { name: string; amountCents: number; date: IsoDate } | null;
  shortfall: ShortfallProjection;
  recentAlerts: { summaryText: string; createdAt: Date }[];
};

type SummaryInput = {
  today: IsoDate;
  availableBalanceCents: number;
  safetyBufferCents: number;
  streams: Stream[];
};

// Pure part of the summary: every number comes from @steelhacks-2026/finance.
export function computeCashPicture(input: SummaryInput) {
  const horizon = addDays(input.today, UPCOMING_BILL_DAYS);
  const upcoming = (kind: Stream["kind"]) =>
    input.streams
      .filter(
        (s): s is Stream & { nextExpectedDate: string } =>
          s.kind === kind &&
          s.nextExpectedDate !== null &&
          s.nextExpectedDate >= input.today &&
          s.nextExpectedDate <= horizon,
      )
      .sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate));

  const income = upcoming("income")[0];
  const bills = upcoming("bill");

  const cashFlow: CashFlowInput = {
    availableBalanceCents: input.availableBalanceCents,
    upcomingBills: bills.map((b) => ({
      name: b.name,
      amountCents: b.averageAmountCents,
      dueDate: b.nextExpectedDate,
    })),
    nextIncomeDate: income?.nextExpectedDate ?? null,
    today: input.today,
    bufferCents: input.safetyBufferCents,
  };

  let remaining = input.availableBalanceCents;
  const upcomingBills = cashFlow.upcomingBills.map((b) => {
    remaining -= b.amountCents;
    return { ...b, covered: remaining >= 0 };
  });

  return {
    cashFlow,
    safeToSpendCents: safeToSpend(cashFlow),
    shortfall: projectShortfall(cashFlow),
    upcomingBills,
    nextIncome: income
      ? { name: income.name, amountCents: income.averageAmountCents, date: income.nextExpectedDate }
      : null,
  };
}

export async function memberSummary(
  db: Database,
  memberId: string,
  now: Date = new Date(),
): Promise<MemberSummary> {
  const m = await db.query.member.findFirst({ where: eq(member.id, memberId) });
  if (!m) throw new Error(`Member ${memberId} not found`);

  const [accounts, settings, streams, alerts] = await Promise.all([
    db.select().from(bankAccount).where(eq(bankAccount.memberId, memberId)),
    db.query.memberSettings.findFirst({ where: eq(memberSettings.memberId, memberId) }),
    db.select().from(recurringStream).where(eq(recurringStream.memberId, memberId)),
    db
      .select({ summaryText: activityLog.summaryText, createdAt: activityLog.createdAt })
      .from(activityLog)
      .where(and(eq(activityLog.memberId, memberId), eq(activityLog.type, "alert_sent")))
      .orderBy(desc(activityLog.createdAt))
      .limit(5),
  ]);

  // Only checking is spendable day-to-day money. Summing every linked
  // account (as this used to) meant a Plaid Sandbox money-market or CD
  // balance — tens of thousands of dollars that isn't actually liquid —
  // could blow up "safe to spend" into something wildly unrealistic, and a
  // credit card's balance is debt, not cash, and should never add to it.
  const spendable = accounts.filter((a) => a.type === "checking");
  const availableBalanceCents = spendable.reduce((sum, a) => sum + a.availableBalanceCents, 0);
  const currentBalanceCents = spendable.reduce((sum, a) => sum + a.currentBalanceCents, 0);
  const safetyBufferCents = settings?.safetyBufferCents ?? 0;
  const today = todayInTimezone(m.timezone, now);
  const picture = computeCashPicture({ today, availableBalanceCents, safetyBufferCents, streams });

  return {
    memberId,
    preferredName: m.preferredName,
    today,
    availableBalanceCents,
    currentBalanceCents,
    safetyBufferCents,
    safeToSpendCents: picture.safeToSpendCents,
    upcomingBills: picture.upcomingBills,
    nextIncome: picture.nextIncome,
    shortfall: picture.shortfall,
    recentAlerts: alerts,
  };
}
