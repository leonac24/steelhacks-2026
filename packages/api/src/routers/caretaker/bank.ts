// Admin tools for the /bank page: hand-edit the seeded mock bank data
// (accounts + transactions) so the demo doesn't depend on a real bank link.
import { ORPCError } from "@orpc/server";
import { bankAccount } from "@steelhacks-2026/db/schema/index";
import { asc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker, requirePrimaryCaretaker } from "../../index";
import * as activity from "../../services/activity";
import * as bankAdmin from "../../services/bank-admin";
import { connectDemoBank } from "../../services/demo-bank";
import { runBudgetCheck, runFraudCheck } from "../../services/notifications";

const memberInput = z.object({ memberId: z.string() });
const cents = z.number().int().min(-100_000_000).max(100_000_000);

export const bankRouter = {
  // The only bank a caretaker can add from /accounts — see services/demo-bank.
  connectDemo: protectedProcedure
    .input(memberInput)
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const result = await connectDemoBank(context, input.memberId);
      if (!result.alreadyConnected) {
        await activity.log(context.db, {
          memberId: input.memberId,
          type: "bank_synced",
          summaryText: `${context.session.user.name} connected Demo Bank.`,
        });
      }
      return result;
    }),

  accounts: {
    list: protectedProcedure
      .input(memberInput)
      .use(requireCaretaker)
      .handler(({ input, context }) =>
        context.db
          .select()
          .from(bankAccount)
          .where(eq(bankAccount.memberId, input.memberId))
          .orderBy(asc(bankAccount.name)),
      ),

    update: protectedProcedure
      .input(
        memberInput.extend({
          id: z.string(),
          name: z.string().min(1).max(80).optional(),
          mask: z.string().max(4).nullable().optional(),
          currentBalanceCents: cents.optional(),
          availableBalanceCents: cents.optional(),
        }),
      )
      .use(requirePrimaryCaretaker)
      .handler(async ({ input, context }) => {
        const row = await bankAdmin.updateAccount(context.db, input);
        if (!row) throw new ORPCError("NOT_FOUND", { message: "Account not found" });
        await activity.log(context.db, {
          memberId: input.memberId,
          type: "bank_synced",
          summaryText: `${context.session.user.name} edited account "${row.name}".`,
          metadata: { bankAccountId: row.id },
        });
        return row;
      }),
  },

  transactions: {
    create: protectedProcedure
      .input(
        memberInput.extend({
          bankAccountId: z.string(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
          merchantName: z.string().min(1).max(80),
          category: z.string().trim().toLowerCase().min(1).max(40),
          // Positive = money out, negative = deposit.
          amountCents: cents.refine((n) => n !== 0, "Amount can't be zero"),
          pending: z.boolean().default(false),
        }),
      )
      .use(requirePrimaryCaretaker)
      .handler(async ({ input, context }) => {
        const row = await bankAdmin.createTransaction(context.db, input);
        await activity.log(context.db, {
          memberId: input.memberId,
          type: "bank_synced",
          summaryText: `${context.session.user.name} added a transaction: ${input.merchantName}.`,
          metadata: { transactionId: row.id },
        });

        const [fraud, budgets] = await Promise.allSettled([
          runFraudCheck(context.db, input.memberId),
          runBudgetCheck(context.db, input.memberId),
        ]);
        if (fraud.status === "rejected") {
          console.error("bank.transactions.create: fraud check failed", fraud.reason);
        }
        if (budgets.status === "rejected") {
          console.error("bank.transactions.create: budget check failed", budgets.reason);
        }

        return row;
      }),

    update: protectedProcedure
      .input(
        memberInput.extend({
          id: z.string(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
            .optional(),
          merchantName: z.string().min(1).max(80).optional(),
          category: z.string().trim().toLowerCase().min(1).max(40).optional(),
          amountCents: cents.optional(),
          pending: z.boolean().optional(),
        }),
      )
      .use(requirePrimaryCaretaker)
      .handler(async ({ input, context }) => {
        const row = await bankAdmin.updateTransaction(context.db, input);
        if (!row) throw new ORPCError("NOT_FOUND", { message: "Transaction not found" });
        return row;
      }),

    delete: protectedProcedure
      .input(memberInput.extend({ id: z.string() }))
      .use(requirePrimaryCaretaker)
      .handler(async ({ input, context }) => {
        const row = await bankAdmin.deleteTransaction(context.db, input.memberId, input.id);
        if (!row) throw new ORPCError("NOT_FOUND", { message: "Transaction not found" });
        return { id: row.id };
      }),
  },
};
