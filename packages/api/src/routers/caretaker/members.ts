import { ORPCError } from "@orpc/server";
import { activityLog, caretakerLink, member } from "@steelhacks-2026/db/schema/index";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker, requirePrimaryCaretaker } from "../../index";
import { memberSummary } from "../../services/member-summary";
import * as onboarding from "../../services/onboarding";
import {
  defaultPreferredName,
  isValidTimezone,
  LoginAlreadyLinkedError,
  NoAccountForEmailError,
  normalizePhone,
} from "../../services/onboarding-rules";

const memberInput = z.object({ memberId: z.string() });

// Callers type phone numbers freely; store one canonical form.
const phone = z.string().transform((value, ctx) => {
  try {
    return normalizePhone(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
    return z.NEVER;
  }
});

const timezone = z.string().refine(isValidTimezone, "Use an IANA timezone, e.g. America/New_York");

// Spoken digit by digit on the phone, so keep it four digits.
const pin = z.string().regex(/^\d{4}$/, "The PIN must be 4 digits");

const profile = {
  fullName: z.string().trim().min(1).max(120),
  preferredName: z.string().trim().min(1).max(60),
  timezone,
};

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

  // Onboarding: creates the member, makes the caller their primary caretaker,
  // and applies the default budgets, alert rules, and permission tiers.
  create: protectedProcedure
    .input(
      z.object({
        ...profile,
        // Falls back to their first name.
        preferredName: profile.preferredName.optional(),
        phoneE164: phone,
        pin,
        // The member has to agree before a caretaker watches their money.
        consented: z.boolean(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!input.consented) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The member has to agree before you can set this up",
        });
      }
      return onboarding.createMember(context.db, {
        ...input,
        preferredName: input.preferredName ?? defaultPreferredName(input.fullName),
        caretakerUserId: context.session.user.id,
      });
    }),

  update: protectedProcedure
    .input(
      memberInput.extend({
        fullName: profile.fullName.optional(),
        preferredName: profile.preferredName.optional(),
        timezone: timezone.optional(),
        consented: z.boolean().optional(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(({ input, context }) =>
      onboarding.updateMember(context.db, {
        ...input,
        caretakerUserId: context.session.user.id,
      }),
    ),

  setPin: protectedProcedure
    .input(memberInput.extend({ pin }))
    .use(requirePrimaryCaretaker)
    .handler(({ input, context }) => onboarding.setPin(context.db, input.memberId, input.pin)),

  // Connects the member's own app login, once they've signed up in the app.
  linkAppLogin: protectedProcedure
    .input(memberInput.extend({ email: z.string().email() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      try {
        return await onboarding.linkAppLogin(context.db, input.memberId, input.email);
      } catch (error) {
        if (error instanceof LoginAlreadyLinkedError) {
          throw new ORPCError("CONFLICT", { message: error.message });
        }
        if (error instanceof NoAccountForEmailError) {
          throw new ORPCError("NOT_FOUND", { message: error.message });
        }
        // Anything else is a real failure; don't disguise it as a 404.
        throw error;
      }
    }),
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
