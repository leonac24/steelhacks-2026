// Backs the dashboard's notifications panel: budget pace warnings (computed
// live, emailed on demand) and fraud findings (checked via Gemini on demand,
// persisted so we don't re-ask the LLM about the same transaction twice).
import { ORPCError } from "@orpc/server";
import { activityLog, member, transaction } from "@steelhacks-2026/db/schema/index";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker, requirePrimaryCaretaker } from "../../index";
import * as activity from "../../services/activity";
import { detectFraud } from "../../services/fraud";
import { sendNotificationEmail } from "../../services/mailer";
import { budgetWarnings, caretakerEmails } from "../../services/notifications";

const memberInput = z.object({ memberId: z.string() });

export const notificationsRouter = {
  budgetWarnings: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) => budgetWarnings(context.db, input.memberId)),

  fraudAlerts: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) =>
      context.db
        .select({
          id: activityLog.id,
          summaryText: activityLog.summaryText,
          metadata: activityLog.metadata,
          createdAt: activityLog.createdAt,
        })
        .from(activityLog)
        .where(
          and(eq(activityLog.memberId, input.memberId), eq(activityLog.type, "fraud_suspected")),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(20),
    ),

  // Sends recent transactions to Gemini, logs+emails any newly-flagged ones.
  // Caretaker-triggered for now; wire this to a cron once that's built.
  runFraudCheck: protectedProcedure
    .input(memberInput)
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const m = await context.db.query.member.findFirst({ where: eq(member.id, input.memberId) });
      if (!m) throw new ORPCError("NOT_FOUND", { message: "Member not found" });

      const recent = await context.db
        .select({
          id: transaction.id,
          date: transaction.date,
          merchantName: transaction.merchantName,
          category: transaction.category,
          amountCents: transaction.amountCents,
        })
        .from(transaction)
        .where(eq(transaction.memberId, input.memberId))
        .orderBy(desc(transaction.date))
        .limit(20);

      let findings;
      try {
        findings = await detectFraud({ preferredName: m.preferredName, transactions: recent });
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: error instanceof Error ? error.message : "Fraud check failed",
        });
      }

      const alreadyFlagged = await context.db
        .select({ metadata: activityLog.metadata })
        .from(activityLog)
        .where(
          and(eq(activityLog.memberId, input.memberId), eq(activityLog.type, "fraud_suspected")),
        );
      const flaggedIds = new Set(
        alreadyFlagged.map((a) => a.metadata.transactionId).filter((id): id is string => !!id),
      );

      const newFindings = findings.filter((f) => !flaggedIds.has(f.transactionId));
      for (const finding of newFindings) {
        const txn = recent.find((t) => t.id === finding.transactionId);
        if (!txn) continue;
        await activity.log(context.db, {
          memberId: input.memberId,
          type: "fraud_suspected",
          summaryText: `Possible fraud: ${txn.merchantName ?? "unknown merchant"} ($${(txn.amountCents / 100).toFixed(2)}) — ${finding.reason}`,
          metadata: { transactionId: finding.transactionId, confidence: finding.confidence },
        });
      }

      let emailed = false;
      if (newFindings.length > 0) {
        const emails = await caretakerEmails(context.db, input.memberId);
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
    }),

  // Emails caretakers about any budget already over (or on pace to go over
  // by Sunday) that they haven't already been notified about this week.
  runBudgetCheck: protectedProcedure
    .input(memberInput)
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const m = await context.db.query.member.findFirst({ where: eq(member.id, input.memberId) });
      if (!m) throw new ORPCError("NOT_FOUND", { message: "Member not found" });

      const warnings = await budgetWarnings(context.db, input.memberId);

      const alreadyNotified = await context.db
        .select({ metadata: activityLog.metadata })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.memberId, input.memberId),
            eq(activityLog.type, "budget_exceeded_warning"),
          ),
        );
      const seen = new Set(
        alreadyNotified.map((a) => `${a.metadata.category}:${a.metadata.endOfWeek}`),
      );

      const newWarnings = warnings.filter((w) => !seen.has(`${w.category}:${w.endOfWeek}`));
      for (const w of newWarnings) {
        await activity.log(context.db, {
          memberId: input.memberId,
          type: "budget_exceeded_warning",
          summaryText: w.alreadyExceeded
            ? `${w.category} budget already over: spent $${(w.spentCents / 100).toFixed(2)} of $${(w.limitCents / 100).toFixed(2)}.`
            : `${w.category} budget on pace to hit $${(w.projectedCents / 100).toFixed(2)} (limit $${(w.limitCents / 100).toFixed(2)}) by ${w.endOfWeek}.`,
          metadata: { category: w.category, endOfWeek: w.endOfWeek },
        });
      }

      let emailed = false;
      if (newWarnings.length > 0) {
        const emails = await caretakerEmails(context.db, input.memberId);
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
    }),
};
