// How this month's spending compares with the budgets the caretaker set.
import type { Database } from "@steelhacks-2026/db";
import { budget, member } from "@steelhacks-2026/db/schema/index";
import {
  budgetStatus,
  monthRange,
  todayInTimezone,
  type BudgetStatus,
  type MonthRange,
} from "@steelhacks-2026/finance";
import { asc, eq } from "drizzle-orm";

import { categoryBreakdown, type CategoryTotal } from "./insights";

export type BudgetProgress = BudgetStatus & { category: string };

export type BudgetsOverview = {
  month: MonthRange;
  budgets: BudgetProgress[];
  // Money spent in categories with no budget. A typo like "grocerys" shows up
  // here as the real spending sitting outside its budget.
  unbudgeted: CategoryTotal[];
  totals: BudgetStatus;
};

type BudgetRow = { category: string; monthlyLimitCents: number };

// Pure: join the budgets to this month's spending.
export function mergeSpending(
  budgets: BudgetRow[],
  spending: CategoryTotal[],
  month: MonthRange,
): Omit<BudgetsOverview, "month"> {
  const spentByCategory = new Map(spending.map((s) => [s.category, s.totalCents]));

  const progress = budgets.map((b) => ({
    category: b.category,
    ...budgetStatus(b.monthlyLimitCents, spentByCategory.get(b.category) ?? 0, month),
  }));

  const budgeted = new Set(budgets.map((b) => b.category));
  const unbudgeted = spending
    .filter((s) => !budgeted.has(s.category) && s.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);

  const totalLimit = budgets.reduce((sum, b) => sum + b.monthlyLimitCents, 0);
  const totalSpent = progress.reduce((sum, p) => sum + p.spentCents, 0);

  return { budgets: progress, unbudgeted, totals: budgetStatus(totalLimit, totalSpent, month) };
}

export async function budgetsOverview(
  db: Database,
  memberId: string,
  now: Date = new Date(),
): Promise<BudgetsOverview> {
  const target = await db.query.member.findFirst({ where: eq(member.id, memberId) });
  if (!target) throw new Error(`Member ${memberId} not found`);

  const month = monthRange(todayInTimezone(target.timezone, now));
  const [budgets, spending] = await Promise.all([
    db
      .select({ category: budget.category, monthlyLimitCents: budget.monthlyLimitCents })
      .from(budget)
      .where(eq(budget.memberId, memberId))
      .orderBy(asc(budget.category)),
    // Month to date: spending after today would be the future.
    categoryBreakdown(db, memberId, {
      from: month.from,
      to: todayInTimezone(target.timezone, now),
    }),
  ]);

  return { month, ...mergeSpending(budgets, spending, month) };
}
