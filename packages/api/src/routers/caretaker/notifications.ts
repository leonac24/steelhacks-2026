// Thin wrappers around services/notifications.ts, which also backs the
// automatic post-sync checks in apps/web/src/routes/api/plaid/webhook.ts.
import { ORPCError } from "@orpc/server";
import { activityLog } from "@steelhacks-2026/db/schema/index";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker, requirePrimaryCaretaker } from "../../index";
import * as financialWeather from "../../services/financial-weather";
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

  // What June would read on the next scheduled weather briefing, plus the
  // frequency/is-it-due state that determines when that happens.
  weather: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) => financialWeather.weatherForMember(context.db, input.memberId)),
};
