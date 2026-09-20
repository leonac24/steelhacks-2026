// Thin wrappers around services/notifications.ts, which also backs the
// automatic post-sync checks in apps/web/src/routes/api/plaid/webhook.ts.
import { ORPCError } from "@orpc/server";
import { activityLog } from "@steelhacks-2026/db/schema/index";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker, requirePrimaryCaretaker } from "../../index";
import { budgetWarnings, runBudgetCheck, runFraudCheck } from "../../services/notifications";

const memberInput = z.object({ memberId: z.string() });

async function runOrThrow<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && error.message === "Member not found") {
      throw new ORPCError("NOT_FOUND", { message: "Member not found" });
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: error instanceof Error ? error.message : "Check failed",
    });
  }
}

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
          readAt: activityLog.readAt,
        })
        .from(activityLog)
        .where(
          and(eq(activityLog.memberId, input.memberId), eq(activityLog.type, "fraud_suspected")),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(20),
    ),

  // Caretaker-triggered; the same check also runs automatically after a
  // Plaid sync brings in new transactions (see the webhook route).
  runFraudCheck: protectedProcedure
    .input(memberInput)
    .use(requirePrimaryCaretaker)
    .handler(({ input, context }) => runOrThrow(() => runFraudCheck(context.db, input.memberId))),

  runBudgetCheck: protectedProcedure
    .input(memberInput)
    .use(requirePrimaryCaretaker)
    .handler(({ input, context }) => runOrThrow(() => runBudgetCheck(context.db, input.memberId))),

  // Sidebar badge count. Budget warnings are live-computed, not persisted, so
  // only the persisted fraud_suspected rows have a read/unread state to count.
  unreadCount: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select({ count: count() })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.memberId, input.memberId),
            eq(activityLog.type, "fraud_suspected"),
            isNull(activityLog.readAt),
          ),
        );
      return { count: row?.count ?? 0 };
    }),

  // Called when the caretaker opens /notifications; marks every currently
  // unread fraud alert as read so the badge clears.
  markAllRead: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) =>
      context.db
        .update(activityLog)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(activityLog.memberId, input.memberId),
            eq(activityLog.type, "fraud_suspected"),
            isNull(activityLog.readAt),
          ),
        ),
    ),
};
