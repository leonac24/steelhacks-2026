// Backs the caretaker dashboard's notifications panel: budget pace is
// computed fresh on every read (cheap, deterministic, nothing to dedupe);
// fraud findings are persisted to activityLog since they cost an LLM call.
import type { Database } from "@steelhacks-2026/db";
import { budget, caretakerLink, member, user } from "@steelhacks-2026/db/schema/index";
import { projectBudgetPace, todayInTimezone } from "@steelhacks-2026/finance";
import { eq } from "drizzle-orm";

import { categoryBreakdown } from "./insights";

// Every caretaker (primary or viewer) linked to this member, for notification emails.
export async function caretakerEmails(db: Database, memberId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(caretakerLink)
    .innerJoin(user, eq(user.id, caretakerLink.caretakerUserId))
    .where(eq(caretakerLink.memberId, memberId));
  return rows.map((r) => r.email);
}

export type BudgetWarning = {
  category: string;
  spentCents: number;
  limitCents: number;
  projectedCents: number;
  alreadyExceeded: boolean;
  endOfWeek: string;
};

// Only returns budgets that are already over, or on pace to go over by the
// coming Sunday at the member's current rate of spending.
export async function budgetWarnings(db: Database, memberId: string): Promise<BudgetWarning[]> {
  const m = await db.query.member.findFirst({ where: eq(member.id, memberId) });
  if (!m) return [];

  const today = todayInTimezone(m.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [budgets, spend] = await Promise.all([
    db.select().from(budget).where(eq(budget.memberId, memberId)),
    categoryBreakdown(db, memberId, { from: monthStart, to: today }),
  ]);
  const spentByCategory = new Map(spend.map((s) => [s.category, s.totalCents]));

  const warnings: BudgetWarning[] = [];
  for (const b of budgets) {
    const spentCents = spentByCategory.get(b.category) ?? 0;
    const pace = projectBudgetPace({
      spentCents,
      limitCents: b.monthlyLimitCents,
      monthStart,
      today,
    });
    if (pace.alreadyExceeded || pace.onPaceToExceedByEndOfWeek) {
      warnings.push({
        category: b.category,
        spentCents,
        limitCents: b.monthlyLimitCents,
        projectedCents: pace.projectedCents,
        alreadyExceeded: pace.alreadyExceeded,
        endOfWeek: pace.endOfWeek,
      });
    }
  }
  return warnings;
}
