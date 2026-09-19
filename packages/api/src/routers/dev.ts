// Demo-only procedures. Always mounted (the /demo page needs them in preview
// deploys); every handler refuses to run when NODE_ENV is production.
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { injectMockTransaction } from "../providers/mock";

function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new ORPCError("FORBIDDEN", { message: "Dev procedures are disabled in production" });
  }
}

export const devRouter = {
  // Mints a Plaid Sandbox item for a member so the demo has real data to
  // sync, without a Link UI. No-op error if BANK_PROVIDER isn't "plaid".
  plaidCreateSandboxItem: protectedProcedure
    .input(z.object({ memberId: z.string(), institutionId: z.string().optional() }))
    .handler(async ({ input, context }) => {
      assertNotProduction();
      if (!context.createSandboxPlaidItem) {
        throw new ORPCError("BAD_REQUEST", { message: "Set BANK_PROVIDER=plaid to use this" });
      }
      const result = await context.createSandboxPlaidItem(input);
      // Pull balances right away so the caretaker dashboard has something to show.
      await context.bankProvider.getAccounts(input.memberId);
      return result;
    }),

  // Syncs a member's transactions on demand, independent of whether a real
  // Plaid webhook has fired (sandbox webhooks can lag or need a tunnel).
  plaidSyncNow: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .handler(async ({ input, context }) => {
      assertNotProduction();
      return context.bankProvider.syncTransactions(input.memberId);
    }),

  // Posts a fake transaction for the member (e.g. a $400 unusual charge) and
  // syncs it in immediately. Plaid mode goes through the Sandbox API; mock
  // mode inserts a row directly. Returns the SyncResult so a future alerts
  // step (alerts.evaluate, another team's work) can consume `added` and
  // trigger a call after the transaction lands.
  injectTransaction: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        amountCents: z.number().int(),
        merchantName: z.string(),
        // Plaid Sandbox only accepts the present date or up to 14 days back.
        daysAgo: z.number().int().min(0).max(14).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      assertNotProduction();
      if (context.injectPlaidTransaction) {
        return context.injectPlaidTransaction(input);
      }
      return injectMockTransaction(context.db, input);
    }),
};
