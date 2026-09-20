// Buttons for the live demo. Only mounted when dev tools are enabled.
import { ORPCError } from "@orpc/server";
import { member, memberSettings, user } from "@steelhacks-2026/db/schema/index";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { voiceIdForAssistant } from "../defaults";
import { devProcedure, publicDevProcedure, requirePrimaryCaretaker } from "../index";
import { injectMockTransaction } from "../providers/mock";
import * as activity from "../services/activity";
import { runAlertsForMember } from "../services/alerts";
import { startOutboundSession } from "../services/call-sessions";
import * as changeRequests from "../services/change-requests";
import { connectDemoBank } from "../services/demo-bank";
import { runBudgetCheck, runFraudCheck } from "../services/notifications";
import * as onboarding from "../services/onboarding";
import { normalizePhone } from "../services/onboarding-rules";
import { createElevenLabsPlaceCall } from "../services/outbound-calls";

// A handful of plausible nesters for the "simulate new user" shortcut — just
// enough variety that repeat demos don't all look identical.
const DEMO_NESTERS = [
  { fullName: "Eleanor Chen", preferredName: "Ellie" },
  { fullName: "Walter Nguyen", preferredName: "Walt" },
  { fullName: "Rosa Delgado", preferredName: "Rosa" },
  { fullName: "Harold Jackson", preferredName: "Harold" },
] as const;

// Same idea for the steward account itself — shown in the sidebar afterward,
// so "New Steward" would look obviously fake.
const DEMO_STEWARDS = [
  "Priya Sharma",
  "Marcus Webb",
  "Sofia Marín",
  "Daniel Osei",
  "Grace Lindqvist",
] as const;

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function checkAfterNewTransactions(
  db: Parameters<typeof runFraudCheck>[0],
  memberId: string,
  addedCount: number,
  source: string,
) {
  if (addedCount === 0) return;
  const [fraud, budgets] = await Promise.allSettled([
    runFraudCheck(db, memberId),
    runBudgetCheck(db, memberId),
  ]);
  if (fraud.status === "rejected") console.error(`${source}: fraud check failed`, fraud.reason);
  if (budgets.status === "rejected")
    console.error(`${source}: budget check failed`, budgets.reason);
}

function placeCallFor(context: {
  elevenLabsEnv?: import("../services/outbound-calls").ElevenLabsCallEnv;
}) {
  if (!context.elevenLabsEnv) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message:
        "ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID must be set",
    });
  }
  return createElevenLabsPlaceCall(context.elevenLabsEnv);
}

export const devRouter = {
  // Mints a Plaid Sandbox item for a member so the demo has real data to
  // sync, without a Link UI. No-op error if BANK_PROVIDER isn't "plaid".
  plaidCreateSandboxItem: devProcedure
    .input(z.object({ memberId: z.string(), institutionId: z.string().optional() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      if (!context.createSandboxPlaidItem) {
        throw new ORPCError("BAD_REQUEST", { message: "Set BANK_PROVIDER=plaid to use this" });
      }
      const result = await context.createSandboxPlaidItem(input);
      // Pull balances right away so the caretaker dashboard has something to show.
      await context.bankProviderInstance.getAccounts(input.memberId);
      return result;
    }),

  // Syncs a member's transactions on demand, independent of whether a real
  // Plaid webhook has fired (sandbox webhooks can lag or need a tunnel).
  plaidSyncNow: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const result = await context.bankProviderInstance.syncTransactions(input.memberId);
      await checkAfterNewTransactions(
        context.db,
        input.memberId,
        result.added.length,
        "dev.plaidSyncNow",
      );
      return result;
    }),

  // Simulates a new bank transaction, e.g. a $400 gift-card charge. Writes
  // directly to our own tables regardless of BANK_PROVIDER — Plaid Sandbox's
  // own injection endpoint doesn't reliably surface a specific transaction
  // on demand, so this is the one path that actually shows up in the UI
  // right away. Then runs the alerts engine over what landed, which is the
  // "your assistant calls you" moment.
  injectTransaction: devProcedure
    .input(
      z.object({
        memberId: z.string(),
        // Positive = money out, negative = deposit.
        amountCents: z
          .number()
          .int()
          .refine((n) => n !== 0, "Amount can't be zero"),
        merchantName: z.string().min(1).max(80),
        category: z.string().min(1).max(40).default("other"),
        daysAgo: z.number().int().min(0).max(14).optional(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const sync = await injectMockTransaction(context.db, input);

      const alerts = context.elevenLabsEnv
        ? await runAlertsForMember(context.db, placeCallFor(context), input.memberId)
        : undefined;

      // Fraud + budget checks are independent of the voice engine.
      await checkAfterNewTransactions(
        context.db,
        input.memberId,
        sync.added.length,
        "dev.injectTransaction",
      );
      return { ...sync, alerts };
    }),

  // Syncs the bank, then calls about anything worth calling about.
  runAlerts: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      await context.bankProviderInstance.syncTransactions(input.memberId);
      return runAlertsForMember(context.db, placeCallFor(context), input.memberId);
    }),

  // Settles every overdue approval now instead of waiting for cron.
  processApprovals: devProcedure.handler(({ context }) =>
    changeRequests.processTimeouts(context.db),
  ),

  // "Call me" demo button: places a real outbound call to the member's own
  // phone right now, independent of whether any alert condition fired —
  // the fastest way to show off the voice line live.
  callMe: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const [m, settings] = await Promise.all([
        context.db.query.member.findFirst({ where: eq(member.id, input.memberId) }),
        context.db.query.memberSettings.findFirst({
          where: eq(memberSettings.memberId, input.memberId),
        }),
      ]);
      if (!m) throw new ORPCError("NOT_FOUND", { message: "Member not found" });

      const placeCall = placeCallFor(context);
      const assistantName = settings?.assistantName ?? "your assistant";
      const { conversationId, callSid } = await placeCall({
        toNumber: m.phoneE164,
        dynamicVariables: {
          identified: "yes",
          member_preferred_name: m.preferredName,
          call_direction: "outbound",
          // The agent's prompt only recognizes shortfall_warning,
          // bill_due_unfunded, unusual_transaction, or deposit_arrived — an
          // unrecognized call_reason (e.g. a made-up "demo_call") leaves its
          // opening logic with no matching branch, which is why this hung up
          // immediately before. deposit_arrived is the only one of the four
          // with a positive framing, so it's the least misleading pick for a
          // "nothing's wrong" demo call.
          call_reason: "deposit_arrived",
          alert_detail:
            "This is just a friendly demo call to show how this works — nothing urgent.",
        },
        firstMessage: `Hi ${m.preferredName}, it's ${assistantName} calling for a quick demo — but first, could you tell me your PIN?`,
        voiceId: voiceIdForAssistant(settings?.assistantName),
      });
      if (!conversationId) throw new Error("ElevenLabs returned no conversation_id");

      const session = await startOutboundSession(context.db, {
        memberId: input.memberId,
        conversationId,
        twilioCallSid: callSid,
      });
      await activity.log(context.db, {
        memberId: input.memberId,
        type: "alert_sent",
        summaryText: `${assistantName} placed a demo call to ${m.preferredName}.`,
        metadata: { callSessionId: session.id },
        visibleToCaretaker: true,
      });
      return { conversationId, callSid, callSessionId: session.id };
    }),

  // Sign-in page onboarding shortcut: mints a brand-new steward account (no
  // session required to call this) with one nester already set up, and
  // optionally connects Demo Bank so there's real data to show right away.
  // No pre-seeded history is involved — this is the same path a real new
  // user would go through.
  simulateNewUser: publicDevProcedure
    .input(
      z.object({
        connectDemoBank: z.boolean().default(false),
        // Collected so we can eventually call the person testing the demo.
        phone: z.string().min(1, "A phone number is required"),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!context.createUser) {
        throw new ORPCError("BAD_REQUEST", {
          message: "User creation isn't wired up in this environment",
        });
      }
      let phone: string;
      try {
        phone = normalizePhone(input.phone);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", { message: (error as Error).message });
      }

      const suffix = crypto.randomUUID().slice(0, 8);
      const email = `demo-${suffix}@nestegg.dev`;
      const password = "demo-password-123";
      const stewardName = DEMO_STEWARDS[Math.floor(Math.random() * DEMO_STEWARDS.length)]!;
      const newUser = await context.createUser({ name: stewardName, email, password });
      await context.db.update(user).set({ phone }).where(eq(user.id, newUser.id));

      const nester = DEMO_NESTERS[Math.floor(Math.random() * DEMO_NESTERS.length)]!;
      const member = await onboarding.createMember(context.db, {
        caretakerUserId: newUser.id,
        fullName: nester.fullName,
        preferredName: nester.preferredName,
        // The same real number just collected for the steward's account —
        // not a random undialable one — so outbound demo calls (which dial
        // member.phoneE164) actually reach the person testing the demo.
        phoneE164: phone,
        pin: randomPin(),
        timezone: "America/New_York",
        consented: true,
      });

      let bankConnected = false;
      if (input.connectDemoBank) {
        try {
          await connectDemoBank(context, member.id);
          bankConnected = true;
        } catch (error) {
          console.error("simulateNewUser: failed to connect demo bank", error);
        }
      }

      return { email, password, memberId: member.id, bankConnected };
    }),
};
