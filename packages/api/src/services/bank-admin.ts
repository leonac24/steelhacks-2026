// Backs the /bank admin page: lets a caretaker hand-edit the seeded mock
// bank data (accounts + transactions) instead of waiting on a real bank
// connection. Keeps account balances consistent with whatever transactions
// exist, the same way a real sync would.
import type { Database } from "@steelhacks-2026/db";
import { bankAccount, transaction } from "@steelhacks-2026/db/schema/index";
import { and, eq, sql } from "drizzle-orm";

async function adjustBalance(db: Database, bankAccountId: string, deltaCents: number) {
  if (deltaCents === 0) return;
  await db
    .update(bankAccount)
    .set({
      currentBalanceCents: sql`${bankAccount.currentBalanceCents} + ${deltaCents}`,
      availableBalanceCents: sql`${bankAccount.availableBalanceCents} + ${deltaCents}`,
    })
    .where(eq(bankAccount.id, bankAccountId));
}

export type CreateTransactionInput = {
  memberId: string;
  bankAccountId: string;
  date: string;
  merchantName: string;
  category: string;
  amountCents: number;
  pending: boolean;
};

export async function createTransaction(db: Database, input: CreateTransactionInput) {
  const [row] = await db
    .insert(transaction)
    .values({
      memberId: input.memberId,
      bankAccountId: input.bankAccountId,
      providerTxnId: `manual-${crypto.randomUUID()}`,
      date: input.date,
      merchantName: input.merchantName,
      category: input.category,
      amountCents: input.amountCents,
      pending: input.pending,
      source: "bank",
    })
    .returning();
  if (!row) throw new Error("Failed to create transaction");
  // Positive amountCents = money out, so recording an expense lowers the balance.
  await adjustBalance(db, input.bankAccountId, -input.amountCents);
  return row;
}

export type UpdateTransactionInput = {
  memberId: string;
  id: string;
  date?: string;
  merchantName?: string;
  category?: string;
  amountCents?: number;
  pending?: boolean;
};

export async function updateTransaction(db: Database, input: UpdateTransactionInput) {
  const { memberId, id, ...changes } = input;
  const existing = await db.query.transaction.findFirst({
    where: and(eq(transaction.id, id), eq(transaction.memberId, memberId)),
  });
  if (!existing) return null;

  const [row] = await db.update(transaction).set(changes).where(eq(transaction.id, id)).returning();
  if (row?.bankAccountId && changes.amountCents !== undefined) {
    // Undo the old effect, apply the new one.
    await adjustBalance(db, row.bankAccountId, existing.amountCents - changes.amountCents);
  }
  return row;
}

export async function deleteTransaction(db: Database, memberId: string, id: string) {
  const [row] = await db
    .delete(transaction)
    .where(and(eq(transaction.id, id), eq(transaction.memberId, memberId)))
    .returning();
  if (row?.bankAccountId) {
    // Removing a recorded expense gives the balance back.
    await adjustBalance(db, row.bankAccountId, row.amountCents);
  }
  return row;
}

export type UpdateAccountInput = {
  memberId: string;
  id: string;
  name?: string;
  mask?: string | null;
  currentBalanceCents?: number;
  availableBalanceCents?: number;
};

export async function updateAccount(db: Database, input: UpdateAccountInput) {
  const { memberId, id, ...changes } = input;
  const [row] = await db
    .update(bankAccount)
    .set(changes)
    .where(and(eq(bankAccount.id, id), eq(bankAccount.memberId, memberId)))
    .returning();
  return row;
}
