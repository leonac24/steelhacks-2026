// Read-only views for the member's own native app.
import { activityLog, caretakerLink, user } from "@steelhacks-2026/db/schema/index";
import { and, desc, eq } from "drizzle-orm";

import { memberProcedure } from "../index";
import { budgetsOverview } from "../services/budgets";
import { memberSummary } from "../services/member-summary";

export const memberRouter = {
  // Read-only: the member sees their limits but changes them by phone, where
  // the change-request flow applies.
  budgets: memberProcedure.handler(({ context }) => budgetsOverview(context.db, context.member.id)),

  summary: memberProcedure.handler(({ context }) => memberSummary(context.db, context.member.id)),

  bills: memberProcedure.handler(async ({ context }) => {
    const summary = await memberSummary(context.db, context.member.id);
    return {
      today: summary.today,
      upcomingBills: summary.upcomingBills,
      nextIncome: summary.nextIncome,
    };
  }),

  alerts: memberProcedure.handler(({ context }) =>
    context.db
      .select({
        id: activityLog.id,
        summaryText: activityLog.summaryText,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(and(eq(activityLog.memberId, context.member.id), eq(activityLog.type, "alert_sent")))
      .orderBy(desc(activityLog.createdAt))
      .limit(20),
  ),

  // Who can see this member's activity. Names only.
  caretakers: memberProcedure.handler(({ context }) =>
    context.db
      .select({ name: user.name, role: caretakerLink.role })
      .from(caretakerLink)
      .innerJoin(user, eq(user.id, caretakerLink.caretakerUserId))
      .where(eq(caretakerLink.memberId, context.member.id))
      .orderBy(caretakerLink.role, user.name),
  ),
};
