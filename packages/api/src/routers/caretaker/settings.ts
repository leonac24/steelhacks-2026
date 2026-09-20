// Caretaker edits apply directly (no change request); each one is logged so
// the activity feed shows who changed what.
import { ORPCError } from "@orpc/server";
import {
  alertRule,
  alertRuleType,
  approvalTimeout,
  budget,
  memberSettings,
  permission,
  permissionChangeType,
  permissionTier,
  reminderMode,
  trustedContact,
} from "@steelhacks-2026/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker, requirePrimaryCaretaker } from "../../index";
import * as activity from "../../services/activity";
import { budgetsOverview } from "../../services/budgets";
import { cents, clockTime, payloadSchemas } from "../../services/change-rules";

const memberInput = z.object({ memberId: z.string() });

function logEdit(
  context: {
    db: Parameters<typeof activity.log>[0];
    session: { user: { id: string; name: string } };
  },
  memberId: string,
  summaryText: string,
) {
  return activity.log(context.db, {
    memberId,
    type: "settings_updated",
    summaryText: `${context.session.user.name} ${summaryText}`,
    metadata: { byUserId: context.session.user.id },
  });
}

const SETTING_LABELS = {
  safetyBufferCents: "the safety cushion",
  quietHoursStart: "quiet hours",
  quietHoursEnd: "quiet hours",
  maxCallsPerDay: "calls per day",
  reminderMode: "reminders",
  voiceSpeed: "voice speed",
  notifyCaretakerOnUnanswered: "missed-call notices",
} as const;

export const settingsRouter = {
  get: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      const settings = await context.db.query.memberSettings.findFirst({
        where: eq(memberSettings.memberId, input.memberId),
      });
      if (!settings) throw new ORPCError("NOT_FOUND", { message: "Settings not found" });
      return settings;
    }),

  update: protectedProcedure
    .input(
      memberInput.extend({
        safetyBufferCents: cents.optional(),
        quietHoursStart: clockTime.optional(),
        quietHoursEnd: clockTime.optional(),
        maxCallsPerDay: z.number().int().min(0).max(10).optional(),
        reminderMode: z.enum(reminderMode.enumValues).optional(),
        // ElevenLabs accepts roughly 0.7-1.2.
        voiceSpeed: z.number().min(0.7).max(1.2).optional(),
        notifyCaretakerOnUnanswered: z.boolean().optional(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const { memberId, ...changes } = input;
      const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter(
        (key) => changes[key] !== undefined,
      );
      if (changed.length === 0)
        throw new ORPCError("BAD_REQUEST", { message: "Nothing to update" });
      const [row] = await context.db
        .update(memberSettings)
        .set(changes)
        .where(eq(memberSettings.memberId, memberId))
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Settings not found" });
      await logEdit(
        context,
        memberId,
        `updated ${[...new Set(changed.map((k) => SETTING_LABELS[k]))].join(", ")}.`,
      );
      return row;
    }),
};

export const budgetsRouter = {
  // Budgets with this month's spending against them; what a budget screen shows.
  progress: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) => budgetsOverview(context.db, input.memberId)),

  list: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) =>
      context.db
        .select()
        .from(budget)
        .where(eq(budget.memberId, input.memberId))
        .orderBy(asc(budget.category)),
    ),

  upsert: protectedProcedure
    .input(memberInput.extend(payloadSchemas.budget_update.shape))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .insert(budget)
        .values(input)
        .onConflictDoUpdate({
          target: [budget.memberId, budget.category],
          set: { monthlyLimitCents: input.monthlyLimitCents },
        })
        .returning();
      await logEdit(context, input.memberId, `set the ${input.category} budget.`);
      return row;
    }),

  remove: protectedProcedure
    .input(memberInput.extend({ category: payloadSchemas.budget_update.shape.category }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .delete(budget)
        .where(and(eq(budget.memberId, input.memberId), eq(budget.category, input.category)))
        .returning({ category: budget.category });
      if (!row) throw new ORPCError("NOT_FOUND", { message: "No budget for that category" });
      await logEdit(context, input.memberId, `removed the ${input.category} budget.`);
      return row;
    }),
};

export const permissionsRouter = {
  list: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) =>
      context.db.select().from(permission).where(eq(permission.memberId, input.memberId)),
    ),

  update: protectedProcedure
    .input(
      memberInput.extend({
        changeType: z.enum(permissionChangeType.enumValues),
        tier: z.enum(permissionTier.enumValues),
        onTimeout: z.enum(approvalTimeout.enumValues).default("expire"),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .insert(permission)
        .values(input)
        .onConflictDoUpdate({
          target: [permission.memberId, permission.changeType],
          set: { tier: input.tier, onTimeout: input.onTimeout },
        })
        .returning();
      await logEdit(context, input.memberId, `changed the ${input.changeType} permission.`);
      return row;
    }),
};

export const alertRulesRouter = {
  list: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) =>
      context.db.select().from(alertRule).where(eq(alertRule.memberId, input.memberId)),
    ),

  update: protectedProcedure
    .input(
      memberInput.extend({
        type: z.enum(alertRuleType.enumValues),
        enabled: z.boolean(),
        thresholdCents: cents.nullable().optional(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const { memberId, type, enabled, thresholdCents } = input;
      const [row] = await context.db
        .insert(alertRule)
        .values({ memberId, type, enabled, thresholdCents })
        .onConflictDoUpdate({
          target: [alertRule.memberId, alertRule.type],
          set: { enabled, ...(thresholdCents !== undefined && { thresholdCents }) },
        })
        .returning();
      await logEdit(context, memberId, `turned ${enabled ? "on" : "off"} ${type} alerts.`);
      return row;
    }),
};

export const trustedContactsRouter = {
  list: protectedProcedure
    .input(memberInput)
    .use(requireCaretaker)
    .handler(({ input, context }) =>
      context.db
        .select()
        .from(trustedContact)
        .where(eq(trustedContact.memberId, input.memberId))
        .orderBy(asc(trustedContact.createdAt)),
    ),

  // Creates when `id` is omitted, otherwise edits that contact.
  upsert: protectedProcedure
    .input(
      memberInput.extend({
        id: z.string().optional(),
        ...payloadSchemas.trusted_contact_update.shape,
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const { id, memberId, ...fields } = input;
      const [row] = id
        ? await context.db
            .update(trustedContact)
            .set(fields)
            .where(and(eq(trustedContact.id, id), eq(trustedContact.memberId, memberId)))
            .returning()
        : await context.db
            .insert(trustedContact)
            .values({ memberId, ...fields })
            .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Trusted contact not found" });
      await logEdit(context, memberId, `${id ? "updated" : "added"} trusted contact ${row.name}.`);
      return row;
    }),

  remove: protectedProcedure
    .input(memberInput.extend({ id: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .delete(trustedContact)
        .where(and(eq(trustedContact.id, input.id), eq(trustedContact.memberId, input.memberId)))
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Trusted contact not found" });
      await logEdit(context, input.memberId, `removed trusted contact ${row.name}.`);
      return { id: row.id };
    }),
};
