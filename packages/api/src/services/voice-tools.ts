// Transport-agnostic implementations of June's nine tools. No Request/Response
// types here: the HTTP layer (M5) parses/authorizes and calls these, so they
// stay thin and testable. Every dollar amount the LLM speaks is pre-formatted
// via formatCentsForSpeech; never pass raw cents and let the model do math.
import type { Database } from "@steelhacks-2026/db";
import {
  alertSent,
  budget,
  caretakerLink,
  changeType as changeTypeEnum,
  transaction,
  user,
} from "@steelhacks-2026/db/schema/index";
import {
  canAfford,
  formatCentsForSpeech,
  todayInTimezone,
  type CashFlowInput,
} from "@steelhacks-2026/finance";
import { and, asc, desc, eq, gt, gte, sql } from "drizzle-orm";
import z from "zod";

import type { CallSessionRow, MemberRow } from "./call-sessions";
import * as activity from "./activity";
import * as changeRequests from "./change-requests";
import type { ConfirmRejection } from "./change-rules";
import { memberSummary } from "./member-summary";
import { notifyCaretakers } from "./notify";

// ---------------------------------------------------------------------------
// Pure string builders (unit-tested in voice-tools.test.ts)
// ---------------------------------------------------------------------------

export function dollarsToCents(amountDollars: number): number {
  return Math.round(amountDollars * 100);
}

export function buildShortfallWarning(
  shortfallCents: number,
  nextIncomeName: string | null,
  nextIncomeDate: string | null,
): string {
  const amount = formatCentsForSpeech(shortfallCents);
  const income = nextIncomeName ?? "deposit";
  const when = nextIncomeDate ? ` on ${nextIncomeDate}` : "";
  return `Heads up: you may be short about ${amount} before your next ${income}${when}.`;
}

export function buildAffordExplanation(
  answer: "yes" | "yes_but_tight" | "no",
  remainingAfterCents: number,
  nextIncomeDate: string | null,
): string {
  switch (answer) {
    case "yes":
      return "Yes, you can afford that.";
    case "yes_but_tight":
      return "Yes, but it'll be tight — it dips into your safety cushion.";
    case "no":
      return `That won't fit — you'd be short about ${formatCentsForSpeech(
        -remainingAfterCents,
      )} before your next income${nextIncomeDate ? ` on ${nextIncomeDate}` : ""}.`;
  }
}

export function buildConfirmationRejection(reason: ConfirmRejection): string {
  switch (reason) {
    case "not_found":
      return "I couldn't find that request — let's start the change again.";
    case "already_handled":
      return "That change was already handled.";
    case "expired":
      return "That confirmation timed out — let's start the change again.";
    case "wrong_call":
      return "I can't confirm that change here — let's start it again.";
  }
}

export function flattenZodMessage(error: z.ZodError): string {
  const flat = z.flattenError(error);
  const messages = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()];
  return messages.join(" ") || "That didn't look right.";
}

// ---------------------------------------------------------------------------
// Zod input schemas (exported for the M5 route to validate before calling)
// ---------------------------------------------------------------------------

export const getRecentTransactionsInput = z.object({
  limit: z.number().int().min(1).max(10).optional().default(5),
});
export const checkAffordabilityInput = z.object({
  amount_dollars: z.number().positive().max(100_000),
});
export const proposeChangeInput = z.object({
  change_type: z.enum(changeTypeEnum.enumValues),
  payload: z.record(z.string(), z.unknown()),
});
export const confirmChangeInput = z.object({ confirmation_id: z.string().min(1) });
export const flagTransactionInput = z.object({ transaction_id: z.string().min(1) });

type GetRecentTransactionsInput = z.infer<typeof getRecentTransactionsInput>;
type CheckAffordabilityInput = z.infer<typeof checkAffordabilityInput>;
type ProposeChangeInput = z.infer<typeof proposeChangeInput>;
type ConfirmChangeInput = z.infer<typeof confirmChangeInput>;
type FlagTransactionInput = z.infer<typeof flagTransactionInput>;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export async function getBalance(db: Database, member: MemberRow) {
  const summary = await memberSummary(db, member.id);
  const warning = summary.shortfall.willShortfall
    ? buildShortfallWarning(
        summary.shortfall.shortfallCents,
        summary.nextIncome?.name ?? null,
        summary.nextIncome?.date ?? null,
      )
    : null;
  return {
    ok: true,
    available_spoken: formatCentsForSpeech(summary.availableBalanceCents),
    safe_to_spend_spoken: formatCentsForSpeech(summary.safeToSpendCents),
    shortfall_warning: warning,
  };
}

export async function getUpcomingBills(db: Database, member: MemberRow) {
  const summary = await memberSummary(db, member.id);
  return {
    ok: true,
    bills: summary.upcomingBills.map((b) => ({
      name: b.name,
      due_date: b.dueDate,
      amount_spoken: formatCentsForSpeech(b.amountCents),
      covered: b.covered,
    })),
    next_income: summary.nextIncome
      ? {
          name: summary.nextIncome.name,
          date: summary.nextIncome.date,
          amount_spoken: formatCentsForSpeech(summary.nextIncome.amountCents),
        }
      : null,
  };
}

export async function getRecentTransactions(
  db: Database,
  member: MemberRow,
  input: GetRecentTransactionsInput,
) {
  const limit = input.limit ?? 5;
  const rows = await db
    .select()
    .from(transaction)
    .where(eq(transaction.memberId, member.id))
    .orderBy(asc(transaction.pending), desc(transaction.date))
    .limit(limit);
  return {
    ok: true,
    transactions: rows.map((t) => ({
      transaction_id: t.id,
      date: t.date,
      merchant: t.merchantName ?? "",
      amount_spoken: formatCentsForSpeech(Math.abs(t.amountCents)),
      direction: t.amountCents > 0 ? ("out" as const) : ("in" as const),
      pending: t.pending,
    })),
  };
}

export async function checkAffordability(
  db: Database,
  member: MemberRow,
  input: CheckAffordabilityInput,
) {
  const cents = dollarsToCents(input.amount_dollars);
  const summary = await memberSummary(db, member.id);
  const cashFlow: CashFlowInput = {
    availableBalanceCents: summary.availableBalanceCents,
    upcomingBills: summary.upcomingBills.map((b) => ({
      name: b.name,
      amountCents: b.amountCents,
      dueDate: b.dueDate,
    })),
    nextIncomeDate: summary.nextIncome?.date ?? null,
    today: summary.today,
    bufferCents: summary.safetyBufferCents,
  };
  const result = canAfford(cents, cashFlow);
  return {
    ok: true,
    answer: result.answer,
    explanation_spoken: buildAffordExplanation(result.answer, result.remainingAfter, result.nextIncomeDate),
  };
}

export async function getBudgets(db: Database, member: MemberRow) {
  const monthStart = `${todayInTimezone(member.timezone).slice(0, 8)}01`;
  const [budgets, spendRows] = await Promise.all([
    db.select().from(budget).where(eq(budget.memberId, member.id)).orderBy(asc(budget.category)),
    db
      .select({
        category: transaction.category,
        total: sql<number>`coalesce(sum(${transaction.amountCents}), 0)::int`,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.memberId, member.id),
          gt(transaction.amountCents, 0),
          gte(transaction.date, monthStart),
        ),
      )
      .groupBy(transaction.category),
  ]);
  const spentByCategory = new Map(spendRows.map((r) => [r.category, Number(r.total)]));
  return {
    ok: true,
    budgets: budgets.map((b) => ({
      category: b.category,
      monthly_limit_spoken: formatCentsForSpeech(b.monthlyLimitCents),
      spent_so_far_spoken: formatCentsForSpeech(spentByCategory.get(b.category) ?? 0),
    })),
  };
}

export async function proposeChange(
  db: Database,
  member: MemberRow,
  session: CallSessionRow,
  input: ProposeChangeInput,
) {
  try {
    const result = await changeRequests.propose(db, {
      memberId: member.id,
      changeType: input.change_type,
      payload: input.payload,
      callSessionId: session.id,
    });
    return {
      ok: true,
      confirmation_id: result.confirmationId,
      summary: result.summaryText,
      instruction:
        "Read the summary back to the member and call confirm_change only after they clearly say yes.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: flattenZodMessage(error) };
    throw error;
  }
}

async function primaryCaretakerName(db: Database, memberId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: user.name })
    .from(caretakerLink)
    .innerJoin(user, eq(user.id, caretakerLink.caretakerUserId))
    .where(and(eq(caretakerLink.memberId, memberId), eq(caretakerLink.role, "primary")));
  return row?.name ?? null;
}

export async function confirmChange(
  db: Database,
  session: CallSessionRow,
  input: ConfirmChangeInput,
) {
  const result = await changeRequests.confirm(db, {
    confirmationId: input.confirmation_id,
    callSessionId: session.id,
  });
  if (!result.ok) {
    return { ok: false, error: buildConfirmationRejection(result.reason) };
  }
  if (result.status === "awaiting_approval") {
    const name = session.memberId ? await primaryCaretakerName(db, session.memberId) : null;
    return {
      ok: true,
      status: "awaiting_approval",
      spoken: `I've sent that to ${name ?? "your caretaker"} to approve. It'll apply once they say yes.`,
    };
  }
  return { ok: true, status: "applied", spoken: `Done — ${result.summaryText}` };
}

export async function flagTransaction(
  db: Database,
  member: MemberRow,
  input: FlagTransactionInput,
) {
  const txn = await db.query.transaction.findFirst({
    where: and(
      eq(transaction.id, input.transaction_id),
      eq(transaction.memberId, member.id),
    ),
  });
  if (!txn) return { ok: false, error: "I couldn't find that charge." };

  const dedupeKey = `${member.id}:unusual:${input.transaction_id}`;

  // Alert flow reuse: the member already knows about this charge, so the
  // "unusual_txn" alert is recorded as skipped — but the shared dedupe key
  // means June will never proactively call about it either.
  await db
    .insert(alertSent)
    .values({
      memberId: member.id,
      ruleType: "unusual_txn",
      dedupeKey,
      channel: "call",
      status: "skipped",
    })
    .onConflictDoNothing();

  const amount = formatCentsForSpeech(Math.abs(txn.amountCents));
  const summary = `${member.preferredName} reported an unrecognized charge: ${
    txn.merchantName ?? "a merchant"
  }, ${amount} on ${txn.date}.`;

  await activity.log(db, {
    memberId: member.id,
    type: "alert_sent",
    summaryText: summary,
    metadata: { transactionId: txn.id },
    visibleToCaretaker: true,
  });
  await notifyCaretakers(db, member.id, summary);

  return {
    ok: true,
    spoken:
      "I've flagged that charge and let your family know. Don't share your PIN or card number with anyone who calls you.",
  };
}