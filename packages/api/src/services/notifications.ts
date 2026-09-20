// Backs the caretaker notifications panel AND the Plaid webhook's
// after-sync checks (same functions, two callers): budget pace is computed
// fresh on every read (cheap, deterministic, nothing to dedupe); fraud
// findings are persisted to activityLog since they cost an LLM call.
import type { Database } from "@steelhacks-2026/db";
import {
  activityLog,
  budget,
  caretakerLink,
  member,
  transaction,
  user,
} from "@steelhacks-2026/db/schema/index";
import { projectBudgetPace, todayInTimezone } from "@steelhacks-2026/finance";
import { and, desc, eq } from "drizzle-orm";

import * as activity from "./activity";
import { detectFraud } from "./fraud";
import { categoryBreakdown } from "./insights";
import { sendNotificationEmail } from "./mailer";

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

export type CheckResult = { checked: number; newAlerts: number; emailed: boolean };

// Sends recent transactions to Gemini, logs+emails any newly-flagged ones.
// Called both by the caretaker's "Check for fraud" button and automatically
// after a Plaid sync brings in new transactions.
export async function runFraudCheck(db: Database, memberId: string): Promise<CheckResult> {
  const m = await db.query.member.findFirst({ where: eq(member.id, memberId) });
  if (!m) throw new Error("Member not found");

  const recent = await db
    .select({
      id: transaction.id,
      date: transaction.date,
      merchantName: transaction.merchantName,
      category: transaction.category,
      amountCents: transaction.amountCents,
    })
    .from(transaction)
    .where(eq(transaction.memberId, memberId))
    .orderBy(desc(transaction.date))
    .limit(20);

  const findings = await detectFraud({ preferredName: m.preferredName, transactions: recent });

  const alreadyFlagged = await db
    .select({ metadata: activityLog.metadata })
    .from(activityLog)
    .where(and(eq(activityLog.memberId, memberId), eq(activityLog.type, "fraud_suspected")));
  const flaggedIds = new Set(
    alreadyFlagged.map((a) => a.metadata.transactionId).filter((id): id is string => !!id),
  );

  const newFindings = findings.filter((f) => !flaggedIds.has(f.transactionId));
  for (const finding of newFindings) {
    const txn = recent.find((t) => t.id === finding.transactionId);
    if (!txn) continue;
    await activity.log(db, {
      memberId,
      type: "fraud_suspected",
      summaryText: `Possible fraud: ${txn.merchantName ?? "unknown merchant"} ($${(txn.amountCents / 100).toFixed(2)}) — ${finding.reason}`,
      metadata: { transactionId: finding.transactionId, confidence: finding.confidence },
    });
  }

  let emailed = false;
  if (newFindings.length > 0) {
    const emails = await caretakerEmails(db, memberId);
    const body = newFindings
      .map((f) => {
        const txn = recent.find((t) => t.id === f.transactionId);
        return `- ${txn?.merchantName ?? "unknown merchant"} ($${((txn?.amountCents ?? 0) / 100).toFixed(2)}) on ${txn?.date}: ${f.reason}`;
      })
      .join("\n");
    const result = await sendNotificationEmail({
      to: emails,
      subject: `Possible fraud alert for ${m.preferredName}`,
      text: `${newFindings.length} transaction(s) flagged as possibly fraudulent:\n\n${body}`,
    });
    emailed = result.sent;
  }

  return { checked: recent.length, newAlerts: newFindings.length, emailed };
}

// Emails+logs any budget already over (or on pace to go over by Sunday) that
// caretakers haven't already been notified about this week. Called both by
// the "Check budgets" button and automatically after a Plaid sync.
export async function runBudgetCheck(db: Database, memberId: string): Promise<CheckResult> {
  const m = await db.query.member.findFirst({ where: eq(member.id, memberId) });
  if (!m) throw new Error("Member not found");

  const warnings = await budgetWarnings(db, memberId);

  const alreadyNotified = await db
    .select({ metadata: activityLog.metadata })
    .from(activityLog)
    .where(
      and(eq(activityLog.memberId, memberId), eq(activityLog.type, "budget_exceeded_warning")),
    );
  const seen = new Set(
    alreadyNotified.map((a) => `${a.metadata.category}:${a.metadata.endOfWeek}`),
  );

  const newWarnings = warnings.filter((w) => !seen.has(`${w.category}:${w.endOfWeek}`));
  for (const w of newWarnings) {
    await activity.log(db, {
      memberId,
      type: "budget_exceeded_warning",
      summaryText: w.alreadyExceeded
        ? `${w.category} budget already over: spent $${(w.spentCents / 100).toFixed(2)} of $${(w.limitCents / 100).toFixed(2)}.`
        : `${w.category} budget on pace to hit $${(w.projectedCents / 100).toFixed(2)} (limit $${(w.limitCents / 100).toFixed(2)}) by ${w.endOfWeek}.`,
      metadata: { category: w.category, endOfWeek: w.endOfWeek },
    });
  }

  let emailed = false;
  if (newWarnings.length > 0) {
    const emails = await caretakerEmails(db, memberId);
    const body = newWarnings
      .map((w) =>
        w.alreadyExceeded
          ? `- ${w.category}: already over, $${(w.spentCents / 100).toFixed(2)} of $${(w.limitCents / 100).toFixed(2)} spent`
          : `- ${w.category}: on pace for $${(w.projectedCents / 100).toFixed(2)} (limit $${(w.limitCents / 100).toFixed(2)}) by ${w.endOfWeek}`,
      )
      .join("\n");
    const result = await sendNotificationEmail({
      to: emails,
      subject: `Budget alert for ${m.preferredName}`,
      text: `${newWarnings.length} budget(s) need attention:\n\n${body}`,
    });
    emailed = result.sent;
  }

  return { checked: warnings.length, newAlerts: newWarnings.length, emailed };
}
