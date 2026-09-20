// Chart data for the dashboard/budget pages.
import { ORPCError } from "@orpc/server";
import type { Database } from "@steelhacks-2026/db";
import { member } from "@steelhacks-2026/db/schema/index";
import { addDays, todayInTimezone } from "@steelhacks-2026/finance";
import { eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker } from "../../index";
import { balanceHistory, categoryBreakdown, dailySpending } from "../../services/insights";

const rangeInput = z.object({
  memberId: z.string(),
  days: z.number().int().min(1).max(365).default(30),
});

async function rangeFor(db: Database, memberId: string, days: number) {
  const m = await db.query.member.findFirst({ where: eq(member.id, memberId) });
  if (!m) throw new ORPCError("NOT_FOUND", { message: "Member not found" });
  const to = todayInTimezone(m.timezone);
  return { from: addDays(to, -(days - 1)), to };
}

export const insightsRouter = {
  // Expense totals by category, largest first. Feeds the budget breakdown chart.
  categoryBreakdown: protectedProcedure
    .input(rangeInput)
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      const range = await rangeFor(context.db, input.memberId, input.days);
      return categoryBreakdown(context.db, input.memberId, range);
    }),

  // Daily spend, gaps filled with 0. Feeds the spending-over-time chart.
  dailySpending: protectedProcedure
    .input(rangeInput)
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      const range = await rangeFor(context.db, input.memberId, input.days);
      return dailySpending(context.db, input.memberId, range);
    }),

  // Derived daily balance line. Feeds the dashboard's balance-over-time chart.
  balanceHistory: protectedProcedure
    .input(rangeInput)
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      const range = await rangeFor(context.db, input.memberId, input.days);
      return balanceHistory(context.db, input.memberId, range);
    }),
};
