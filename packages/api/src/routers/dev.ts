// Buttons for the live demo. Only mounted when dev tools are enabled.
import { ORPCError } from "@orpc/server";
import { bankAccount, transaction } from "@steelhacks-2026/db/schema/index";
import { todayInTimezone } from "@steelhacks-2026/finance";
import { eq, sql } from "drizzle-orm";
import z from "zod";

import { devProcedure, requirePrimaryCaretaker } from "../index";
import { createBankProvider } from "../providers";
import * as changeRequests from "../services/change-requests";
import { runAlertsForMember } from "../services/alerts";
import { createElevenLabsPlaceCall } from "../services/outbound-calls";

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
      const alerts = context.elevenLabsEnv
        ? await runAlertsForMember(
            context.db,
            createElevenLabsPlaceCall(context.elevenLabsEnv),
            input.memberId,
          )
        : null;
      return { transactionId: row?.id, synced: sync.added.length, alerts };
    }),

  runAlerts: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      if (!context.elevenLabsEnv) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID must be set",
        });
      }
      return runAlertsForMember(
        context.db,
        createElevenLabsPlaceCall(context.elevenLabsEnv),
        input.memberId,
      );
    }),

  // Settles every overdue approval now instead of waiting for cron.
  processApprovals: devProcedure.handler(({ context }) =>
    changeRequests.processTimeouts(context.db),
  ),
};
