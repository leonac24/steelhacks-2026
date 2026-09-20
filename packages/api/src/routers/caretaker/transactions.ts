// Paginated, filterable transaction list for the caretaker's transactions page.
import { bankAccount, transaction } from "@steelhacks-2026/db/schema/index";
import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, requireCaretaker } from "../../index";

const listInput = z.object({
  memberId: z.string(),
  search: z.string().trim().max(80).optional(),
  category: z.string().optional(),
  bankAccountId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["date", "amount"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

function filtersFor(input: z.infer<typeof listInput>) {
  return and(
    eq(transaction.memberId, input.memberId),
    input.category ? eq(transaction.category, input.category) : undefined,
    input.bankAccountId ? eq(transaction.bankAccountId, input.bankAccountId) : undefined,
    input.from ? gte(transaction.date, input.from) : undefined,
    input.to ? lte(transaction.date, input.to) : undefined,
    input.search ? ilike(transaction.merchantName, `%${input.search}%`) : undefined,
  );
}

export const transactionsRouter = {
  // For the account filter dropdown.
  accounts: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requireCaretaker)
    .handler(({ input, context }) =>
      context.db
        .select({ id: bankAccount.id, name: bankAccount.name, mask: bankAccount.mask })
        .from(bankAccount)
        .where(eq(bankAccount.memberId, input.memberId))
        .orderBy(asc(bankAccount.name)),
    ),

  list: protectedProcedure
    .input(listInput)
    .use(requireCaretaker)
    .handler(async ({ input, context }) => {
      const order = input.sort === "amount" ? transaction.amountCents : transaction.date;
      const orderBy = input.direction === "asc" ? asc(order) : desc(order);

      const [rows, [totals]] = await Promise.all([
        context.db
          .select({
            id: transaction.id,
            date: transaction.date,
            merchantName: transaction.merchantName,
            category: transaction.category,
            amountCents: transaction.amountCents,
            pending: transaction.pending,
            source: transaction.source,
            accountName: bankAccount.name,
            accountMask: bankAccount.mask,
          })
          .from(transaction)
          .leftJoin(bankAccount, eq(transaction.bankAccountId, bankAccount.id))
          .where(filtersFor(input))
          .orderBy(orderBy, desc(transaction.id))
          // One extra row tells us whether there's another page.
          .limit(input.limit + 1)
          .offset(input.offset),
        context.db
          .select({
            count: sql<string>`count(*)`,
            expenseCents: sql<string>`coalesce(sum(${transaction.amountCents}) filter (where ${transaction.amountCents} > 0), 0)`,
            incomeCents: sql<string>`coalesce(sum(${transaction.amountCents}) filter (where ${transaction.amountCents} < 0), 0)`,
          })
          .from(transaction)
          .where(filtersFor(input)),
      ]);

      const hasMore = rows.length > input.limit;
      return {
        items: rows.slice(0, input.limit),
        nextOffset: hasMore ? input.offset + input.limit : null,
        totals: {
          count: Number(totals?.count ?? 0),
          expenseCents: Number(totals?.expenseCents ?? 0),
          // Stored as negative; flip to a positive "total income" figure.
          incomeCents: -Number(totals?.incomeCents ?? 0),
        },
      };
    }),
};
