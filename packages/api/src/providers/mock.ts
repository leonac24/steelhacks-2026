import type { Database } from "@steelhacks-2026/db";
import {
  bankAccount,
  bankConnection,
  recurringStream,
  transaction,
} from "@steelhacks-2026/db/schema/index";
import { and, asc, eq, sql } from "drizzle-orm";

import type { BankDataProvider, SyncResult } from "./types";

// Serves the seeded DB rows as if they came from a bank. The sync cursor is the
// createdAt of the newest transaction already seen, so rows inserted later
// (e.g. by dev.injectTransaction) show up as "added" like a real sync.
export class MockProvider implements BankDataProvider {
  constructor(private db: Database) {}

  getAccounts(memberId: string) {
    return this.db.select().from(bankAccount).where(eq(bankAccount.memberId, memberId));
  }

  async syncTransactions(memberId: string): Promise<SyncResult> {
    const connection = await this.db.query.bankConnection.findFirst({
      where: and(eq(bankConnection.memberId, memberId), eq(bankConnection.provider, "mock")),
    });
    if (!connection) return { added: [], modified: 0, removed: 0 };

    const since = connection.syncCursor ? new Date(connection.syncCursor) : null;
    const added = await this.db
      .select()
      .from(transaction)
      .where(
        and(
          eq(transaction.memberId, memberId),
          // Postgres keeps microseconds but the cursor (a JS Date) only has
          // milliseconds, so compare at millisecond precision.
          since
            ? sql`date_trunc('milliseconds', ${transaction.createdAt}) > ${since.toISOString()}`
            : undefined,
        ),
      )
      .orderBy(asc(transaction.createdAt));

    const newest = added.at(-1);
    if (newest) {
      await this.db
        .update(bankConnection)
        .set({ syncCursor: newest.createdAt.toISOString() })
        .where(eq(bankConnection.id, connection.id));
    }
    return { added, modified: 0, removed: 0 };
  }

  getRecurring(memberId: string) {
    return this.db.select().from(recurringStream).where(eq(recurringStream.memberId, memberId));
  }
}

// Dev/demo only: inserts a fake bank transaction (e.g. a $400 unusual charge)
// directly into our own tables and returns it as "added", the same shape a
// real sync produces. Works regardless of whether the member's bank
// connection is mock or Plaid — Plaid Sandbox's own transaction-injection
// endpoint (sandboxTransactionsCreate) turned out to be unreliable for
// getting a specific transaction to show up on demand (it's meant for
// generating semi-random test data, not literally injecting what you ask
// for), so this is the one path both providers use for the demo buttons.
export async function injectMockTransaction(
  db: Database,
  input: {
    memberId: string;
    amountCents: number;
    merchantName: string;
    category?: string;
    daysAgo?: number;
  },
): Promise<SyncResult> {
  const account = await db.query.bankAccount.findFirst({
    where: eq(bankAccount.memberId, input.memberId),
  });
  if (!account) {
    throw new Error("No bank account for this member; connect Demo Bank first");
  }

  const date = new Date();
  date.setDate(date.getDate() - (input.daysAgo ?? 0));
  const dateString = date.toISOString().slice(0, 10);

  const [row] = await db
    .insert(transaction)
    .values({
      memberId: input.memberId,
      bankAccountId: account.id,
      providerTxnId: `dev-${crypto.randomUUID()}`,
      date: dateString,
      amountCents: input.amountCents,
      merchantName: input.merchantName,
      category: input.category ?? "other",
    })
    .returning();
  if (!row) throw new Error("Failed to insert the demo transaction");

  // Keep balances honest so the dashboard and safe-to-spend move during the demo.
  await db
    .update(bankAccount)
    .set({
      currentBalanceCents: account.currentBalanceCents - input.amountCents,
      availableBalanceCents: account.availableBalanceCents - input.amountCents,
    })
    .where(eq(bankAccount.id, account.id));

  return { added: [row], modified: 0, removed: 0 };
}
