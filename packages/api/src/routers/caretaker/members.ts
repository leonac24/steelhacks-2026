import { activityLog, caretakerLink, member } from "@steelhacks-2026/db/schema/index";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker } from "../../index";
import { memberSummary } from "../../services/member-summary";

const memberInput = z.object({ memberId: z.string() });

export const membersRouter = {
  // Everyone this caretaker looks after.
  list: protectedProcedure.handler(async ({ context }) => {
    return context.db
      .select({
        id: member.id,
        fullName: member.fullName,
        preferredName: member.preferredName,
        timezone: member.timezone,
        role: caretakerLink.role,
      })
      .from(caretakerLink)
      .innerJoin(member, eq(member.id, caretakerLink.memberId))
      .where(eq(caretakerLink.caretakerUserId, context.session.user.id))
      .orderBy(member.fullName);
  }),

  summary: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) => memberSummary(context.db, input.memberId)),
};

export const activityRouter = {
  // Newest first. The dashboard polls page one, so offset paging is fine here.
  list: protectedProcedure
    .input(
      memberInput.extend({
        limit: z.number().int().min(1).max(100).default(30),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      const rows = await context.db
        .select({
          id: activityLog.id,
          type: activityLog.type,
          summaryText: activityLog.summaryText,
          metadata: activityLog.metadata,
          createdAt: activityLog.createdAt,
        })
        .from(activityLog)
        .where(
          and(eq(activityLog.memberId, input.memberId), eq(activityLog.visibleToCaretaker, true)),
        )
        .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
        // One extra row tells us whether there's another page.
        .limit(input.limit + 1)
        .offset(input.offset);
      const hasMore = rows.length > input.limit;
      return {
        items: rows.slice(0, input.limit),
        nextOffset: hasMore ? input.offset + input.limit : null,
      };
    }),
};
