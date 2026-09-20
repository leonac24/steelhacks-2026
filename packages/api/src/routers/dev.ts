// Buttons for the live demo. Only mounted when dev tools are enabled.
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { devProcedure, requirePrimaryCaretaker } from "../index";
import { createBankProvider } from "../providers";
import { injectMockTransaction } from "../providers/mock";
import * as changeRequests from "../services/change-requests";

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
      return createBankProvider(context.db, context.bankProvider).syncTransactions(input.memberId);
    }),

  // Simulates a new bank transaction, e.g. a $400 gift-card charge. Plaid mode
  // goes through the Sandbox API; mock mode inserts a row directly. Returns the
  // SyncResult so a future alerts step (alerts.evaluate, another team's work)
  // can consume `added` and trigger a call after the transaction lands.
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
      if (context.injectPlaidTransaction) {
        return context.injectPlaidTransaction(input);
      }
      return injectMockTransaction(context.db, input);
    }),

  runAlerts: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async (): Promise<{ placed: number }> => {
      // TODO(milestone 9): alerts.evaluate + outboundCalls.place.
      throw new ORPCError("NOT_IMPLEMENTED", { message: "Alerts engine isn't built yet" });
    }),

  // Settles every overdue approval now instead of waiting for cron.
  processApprovals: devProcedure.handler(({ context }) =>
    changeRequests.processTimeouts(context.db),
  ),
};