// Buttons for the live demo. Only mounted when dev tools are enabled.
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { devProcedure, requirePrimaryCaretaker } from "../index";
import { createBankProvider } from "../providers";
import { injectMockTransaction } from "../providers/mock";
import { runAlertsForMember } from "../services/alerts";
import * as changeRequests from "../services/change-requests";
import { runBudgetCheck, runFraudCheck } from "../services/notifications";
import { createElevenLabsPlaceCall } from "../services/outbound-calls";

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

function placeCallFor(context: { elevenLabsEnv?: import("../services/outbound-calls").ElevenLabsCallEnv }) {
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
      await createBankProvider(context.db, context.bankProvider).getAccounts(input.memberId);
      return result;
    }),

  // Syncs a member's transactions on demand, independent of whether a real
  // Plaid webhook has fired (sandbox webhooks can lag or need a tunnel).
  plaidSyncNow: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const result = await createBankProvider(context.db, context.bankProvider).syncTransactions(
        input.memberId,
      );
      await checkAfterNewTransactions(
        context.db,
        input.memberId,
        result.added.length,
        "dev.plaidSyncNow",
      );
      return result;
    }),

  // Simulates a new bank transaction, e.g. a $400 gift-card charge. Plaid mode
  // goes through the Sandbox API; mock mode inserts a row directly. Then runs
  // the alerts engine over what landed, which is the "June calls you" moment.
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
        // Plaid Sandbox only accepts the present date or up to 14 days back.
        daysAgo: z.number().int().min(0).max(14).optional(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const sync = context.injectPlaidTransaction
        ? await context.injectPlaidTransaction(input)
        : await injectMockTransaction(context.db, input);

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
      const provider = createBankProvider(context.db, context.bankProvider);
      await provider.syncTransactions(input.memberId);
      return runAlertsForMember(context.db, placeCallFor(context), input.memberId);
    }),

  // Settles every overdue approval now instead of waiting for cron.
  processApprovals: devProcedure.handler(({ context }) =>
    changeRequests.processTimeouts(context.db),
  ),

  // The demo's "simulate the call" button. Not wired yet — the real path is
  // June's propose_change / confirm_change voice tools, which need a live
  // call session, so this stands in with a clear error until it's built.
  simulateVoiceChange: devProcedure
    .input(
      z.object({
        memberId: z.string(),
        changeType: z.string(),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async (): Promise<{ status: "applied" | "awaiting_approval"; summaryText: string }> => {
      throw new ORPCError("NOT_IMPLEMENTED", {
        message:
          "Voice change simulation isn't wired yet — place a real call and use June's voice tools.",
      });
    }),
};