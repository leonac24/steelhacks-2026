// Buttons for the live demo. Only mounted when dev tools are enabled.
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { devProcedure, requirePrimaryCaretaker } from "../index";
import { createBankProvider } from "../providers";
import { injectMockTransaction } from "../providers/mock";
import * as alerts from "../services/alerts";
import * as changeRequests from "../services/change-requests";
import * as financialWeather from "../services/financial-weather";
import { runBudgetCheck, runFraudCheck } from "../services/notifications";

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

      // Two independent notification channels off the same new transactions:
      // the rule-based alerts engine (may place a voice call), and Gemini
      // fraud + budget-pace checks (land on the caretaker's dashboard/email).
      const [dispatched] = await Promise.all([
        alerts.dispatch(context.db, input.memberId, {
          newTransactions: sync.added,
          elevenLabs: context.elevenLabs,
        }),
        checkAfterNewTransactions(
          context.db,
          input.memberId,
          sync.added.length,
          "dev.injectTransaction",
        ),
      ]);
      return { ...sync, ...dispatched };
    }),

  // Syncs the bank, then calls about anything worth calling about.
  runAlerts: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const provider = createBankProvider(context.db, context.bankProvider);
      const sync = await provider.syncTransactions(input.memberId);
      return alerts.dispatch(context.db, input.memberId, {
        newTransactions: sync.added,
        elevenLabs: context.elevenLabs,
      });
    }),

  // Settles every overdue approval now instead of waiting for cron.
  processApprovals: devProcedure.handler(({ context }) =>
    changeRequests.processTimeouts(context.db),
  ),

  // Stands in for "Dot proposes something to June on a call and June
  // confirms with her". Proposes + immediately confirms, so the change goes
  // live right away for instant-notify tiers, or lands in the caretaker's
  // approval queue for needs-approval tiers.
  simulateVoiceChange: devProcedure
    .input(
      z.object({
        memberId: z.string(),
        changeType: z.string().min(1),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const proposed = await changeRequests.propose(context.db, {
        memberId: input.memberId,
        changeType: input.changeType as Parameters<typeof changeRequests.propose>[1]["changeType"],
        payload: input.payload,
        callSessionId: "demo",
      });
      const confirmed = await changeRequests.confirm(context.db, {
        confirmationId: proposed.confirmationId,
        callSessionId: "demo",
      });
      if (!confirmed.ok) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Voice change wasn't accepted (${confirmed.reason})`,
        });
      }
      return { status: confirmed.status, summaryText: confirmed.summaryText };
    }),

  // Delivers the financial weather briefing immediately, "as if" the daily
  // cron saw it was due — no waiting for the schedule.
  runBriefing: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(({ input, context }) =>
      financialWeather.dispatchBriefing(context.db, input.memberId, {
        force: true,
        elevenLabs: context.elevenLabs,
      }),
    ),
};
