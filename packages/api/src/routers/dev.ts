// Buttons for the live demo. Only mounted when dev tools are enabled.
import { ORPCError } from "@orpc/server";
import { changeType as changeTypeEnum } from "@steelhacks-2026/db/schema/enums";
import { bankAccount, transaction } from "@steelhacks-2026/db/schema/index";
import { todayInTimezone } from "@steelhacks-2026/finance";
import { eq, sql } from "drizzle-orm";
import z from "zod";

import { devProcedure, requirePrimaryCaretaker } from "../index";
import { createBankProvider } from "../providers";
import * as changeRequests from "../services/change-requests";

export const devRouter = {
  // Simulates a new bank transaction, e.g. a $400 gift-card charge.
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
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      if (context.bankProvider === "plaid") {
        // TODO(milestone 9): call Plaid Sandbox /sandbox/transactions/create, then sync.
        // https://plaid.com/docs/api/sandbox/#sandboxtransactionscreate
        throw new ORPCError("NOT_IMPLEMENTED", { message: "Plaid injection isn't set up yet" });
      }
      const account = await context.db.query.bankAccount.findFirst({
        where: eq(bankAccount.memberId, input.memberId),
        with: { member: true },
      });
      if (!account) throw new ORPCError("NOT_FOUND", { message: "Member has no bank account" });

      const [row] = await context.db
        .insert(transaction)
        .values({
          memberId: input.memberId,
          bankAccountId: account.id,
          providerTxnId: `dev-${crypto.randomUUID()}`,
          date: todayInTimezone(account.member.timezone),
          amountCents: input.amountCents,
          merchantName: input.merchantName,
          category: input.category,
        })
        .returning();
      // A real bank moves the balance too.
      await context.db
        .update(bankAccount)
        .set({
          currentBalanceCents: sql`${bankAccount.currentBalanceCents} - ${input.amountCents}`,
          availableBalanceCents: sql`${bankAccount.availableBalanceCents} - ${input.amountCents}`,
        })
        .where(eq(bankAccount.id, account.id));

      const provider = createBankProvider(context.db, context.bankProvider);
      const sync = await provider.syncTransactions(input.memberId);
      // TODO(milestone 9): await alerts.evaluate(context.db, input.memberId) and place calls.
      return { transactionId: row?.id, synced: sync.added.length };
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

  // Stands in for a phone call: proposes a change and immediately confirms it,
  // exactly as /api/tools/propose-change + /api/tools/confirm-change will once
  // milestone 7 lands. Lets the demo fill the approvals queue without Twilio.
  simulateVoiceChange: devProcedure
    .input(
      z.object({
        memberId: z.string(),
        changeType: z.enum(changeTypeEnum.enumValues),
        payload: z.unknown(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const proposed = await changeRequests.propose(context.db, {
        memberId: input.memberId,
        changeType: input.changeType,
        payload: input.payload,
        // No real call session; confirm below passes the same null so they match.
        callSessionId: null,
      });
      const result = await changeRequests.confirm(context.db, {
        confirmationId: proposed.confirmationId,
        callSessionId: null,
      });
      if (!result.ok) {
        throw new ORPCError("CONFLICT", { message: `Confirm failed: ${result.reason}` });
      }
      return { summaryText: proposed.summaryText, status: result.status };
    }),
};
