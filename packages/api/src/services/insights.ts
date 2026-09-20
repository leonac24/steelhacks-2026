// Chart data for the caretaker dashboard. Every number is a plain DB
// aggregate; no arithmetic happens on the client.
import type { Database } from "@steelhacks-2026/db";
import { bankAccount, transaction } from "@steelhacks-2026/db/schema/index";
import { addDays, type IsoDate } from "@steelhacks-2026/finance";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type DateRange = { from: IsoDate; to: IsoDate };

export type CategoryTotal = { category: string; totalCents: number };

// Expense-only (amountCents > 0) totals per category, largest first.
export async function categoryBreakdown(
  db: Database,
  memberId: string,
  range: DateRange,
): Promise<CategoryTotal[]> {
  const rows = await db
    .select({
      category: transaction.category,
      totalCents: sql<string>`sum(${transaction.amountCents})`,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.memberId, memberId),
        gte(transaction.date, range.from),
        lte(transaction.date, range.to),
        sql`${transaction.amountCents} > 0`,
      ),
    )
    .groupBy(transaction.category)
    .orderBy(sql`sum(${transaction.amountCents}) desc`);
  return rows.map((r) => ({ category: r.category, totalCents: Number(r.totalCents) }));
}

export type DailySpend = { date: IsoDate; spentCents: number };

// One point per calendar day in range (gaps filled with 0), expenses only.
export async function dailySpending(
  db: Database,
  memberId: string,
  range: DateRange,
): Promise<DailySpend[]> {
  const rows = await db
    .select({ date: transaction.date, spentCents: sql<string>`sum(${transaction.amountCents})` })
    .from(transaction)
    .where(
      and(
        eq(transaction.memberId, memberId),
        gte(transaction.date, range.from),
        lte(transaction.date, range.to),
        sql`${transaction.amountCents} > 0`,
      ),
    )
    .groupBy(transaction.date);
  const byDate = new Map(rows.map((r) => [r.date, Number(r.spentCents)]));

  const points: DailySpend[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    points.push({ date, spentCents: byDate.get(date) ?? 0 });
  }
  return points;
}

export type BalancePoint = { date: IsoDate; balanceCents: number };

// Reconstructs a daily balance line by walking today's total balance
// backward through each day's net transaction effect. `range.to` must be
// "today" (the balance we actually know); earlier days are derived, not
// stored, since we don't keep historical balance snapshots.
export async function balanceHistory(
  db: Database,
  memberId: string,
  range: DateRange,
): Promise<BalancePoint[]> {
  const totalRow = await db
    .select({ total: sql<string>`coalesce(sum(${bankAccount.currentBalanceCents}), 0)` })
    .from(bankAccount)
    .where(eq(bankAccount.memberId, memberId));
  const total = totalRow[0]?.total ?? "0";

  const netRows = await db
    .select({ date: transaction.date, netCents: sql<string>`sum(${transaction.amountCents})` })
    .from(transaction)
    .where(
      and(
        eq(transaction.memberId, memberId),
        gte(transaction.date, range.from),
        lte(transaction.date, range.to),
      ),
    )
    .groupBy(transaction.date);
  const netByDate = new Map(netRows.map((r) => [r.date, Number(r.netCents)]));

  // Positive amountCents = money out, so undoing a day (to get the balance
  // before it) means adding that day's net back.
  const reversed: BalancePoint[] = [];
  let balance = Number(total);
  for (let date = range.to; date >= range.from; date = addDays(date, -1)) {
    reversed.push({ date, balanceCents: balance });
    balance += netByDate.get(date) ?? 0;
  }
  return reversed.reverse();
}
