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
