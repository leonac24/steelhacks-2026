import { ORPCError } from "@orpc/server";
import type { Database } from "@steelhacks-2026/db";
import { changeRequest } from "@steelhacks-2026/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker, requirePrimaryCaretaker } from "../../index";
import * as changeRequests from "../../services/change-requests";

const decisionInput = z.object({ memberId: z.string(), changeRequestId: z.string() });

// The request must belong to the member the caretaker was authorized for.
async function requireRequestOf(db: Database, memberId: string, changeRequestId: string) {
  const request = await db.query.changeRequest.findFirst({
    where: and(eq(changeRequest.id, changeRequestId), eq(changeRequest.memberId, memberId)),
  });
  if (!request) throw new ORPCError("NOT_FOUND", { message: "Change request not found" });
}

export const approvalsRouter = {
  // Pending decisions, soonest deadline first.
  list: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      return context.db
        .select({
          id: changeRequest.id,
          changeType: changeRequest.changeType,
          summaryText: changeRequest.summaryText,
          approvalDeadline: changeRequest.approvalDeadline,
          createdAt: changeRequest.createdAt,
        })
        .from(changeRequest)
        .where(
          and(
            eq(changeRequest.memberId, input.memberId),
            eq(changeRequest.status, "awaiting_approval"),
          ),
        )
        .orderBy(asc(changeRequest.approvalDeadline));
    }),

  approve: protectedProcedure
    .input(decisionInput)
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      await requireRequestOf(context.db, input.memberId, input.changeRequestId);
      const row = await changeRequests.approve(context.db, {
        changeRequestId: input.changeRequestId,
        decidedByUserId: context.session.user.id,
      });
      if (!row) throw new ORPCError("CONFLICT", { message: "Already decided or expired" });
      return { id: row.id, status: row.status };
    }),

  reject: protectedProcedure
    .input(decisionInput)
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      await requireRequestOf(context.db, input.memberId, input.changeRequestId);
      const row = await changeRequests.reject(context.db, {
        changeRequestId: input.changeRequestId,
        decidedByUserId: context.session.user.id,
      });
      if (!row) throw new ORPCError("CONFLICT", { message: "Already decided or expired" });
      return { id: row.id, status: row.status };
    }),
};
