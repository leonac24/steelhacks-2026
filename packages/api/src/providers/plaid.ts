import type { Database } from "@steelhacks-2026/db";
import {
  bankAccount,
  bankConnection,
  recurringStream,
  transaction,
} from "@steelhacks-2026/db/schema/index";
import { and, eq, inArray } from "drizzle-orm";
import { Products } from "plaid";
import type { PlaidApi } from "plaid";

import {
  removedTransactionIds,
  toBankAccountValues,
  toRecurringStreamValues,
  toTransactionValues,
} from "./plaid-mapping";
import type { BankAccountRow, BankDataProvider, SyncResult } from "./types";

// Talks to real Plaid. Every write lands in our tables so downstream code
// (member-summary, alerts, budgets) only ever reads from the DB, same as
// MockProvider.
export class PlaidProvider implements BankDataProvider {
  constructor(
    private db: Database,
    private plaid: PlaidApi,
  ) {}

  private async loadConnection(memberId: string) {
    const connection = await this.db.query.bankConnection.findFirst({
      where: and(eq(bankConnection.memberId, memberId), eq(bankConnection.provider, "plaid")),
    });
    if (!connection?.accessToken) return null;
    return connection;
  }

  // Upserts our bank_account rows from a Plaid AccountBase array, returning a
  // map of Plaid account_id -> our bank_account.id for transaction linking.
  private async upsertAccounts(
    memberId: string,
    bankConnectionId: string,
    accounts: Awaited<ReturnType<PlaidApi["accountsBalanceGet"]>>["data"]["accounts"],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const account of accounts) {
      const values = toBankAccountValues({ memberId, bankConnectionId, account });
      const [row] = await this.db
        .insert(bankAccount)
        .values(values)
        .onConflictDoUpdate({
          target: bankAccount.providerAccountId,
          set: {
            name: values.name,
            type: values.type,
            mask: values.mask,
            currentBalanceCents: values.currentBalanceCents,
            availableBalanceCents: values.availableBalanceCents,
          },
        })
        .returning();
      if (row) map.set(account.account_id, row.id);
    }
    return map;
  }

  async getAccounts(memberId: string): Promise<BankAccountRow[]> {
    const connection = await this.loadConnection(memberId);
    if (!connection) {
      return this.db.select().from(bankAccount).where(eq(bankAccount.memberId, memberId));
    }
    const { data } = await this.plaid.accountsBalanceGet({ access_token: connection.accessToken! });
    await this.upsertAccounts(memberId, connection.id, data.accounts);
    return this.db.select().from(bankAccount).where(eq(bankAccount.memberId, memberId));
  }

  async syncTransactions(memberId: string): Promise<SyncResult> {
    const connection = await this.loadConnection(memberId);
    if (!connection) return { added: [], modified: 0, removed: 0 };

    let cursor = connection.syncCursor ?? undefined;
    let hasMore = true;
    let addedRows: SyncResult["added"] = [];
    let modifiedCount = 0;
    let removedCount = 0;

    while (hasMore) {
      const { data } = await this.plaid.transactionsSync({
        access_token: connection.accessToken!,
        cursor,
      });

      const accountMap = await this.upsertAccounts(memberId, connection.id, data.accounts);

      for (const txn of data.added) {
        const bankAccountId = accountMap.get(txn.account_id);
        if (!bankAccountId) {
          console.warn(
            `plaid sync: no local account for ${txn.account_id}, skipping txn ${txn.transaction_id}`,
          );
          continue;
        }
        const values = toTransactionValues({ memberId, bankAccountId, txn });
        const [row] = await this.db
          .insert(transaction)
          .values(values)
          .onConflictDoUpdate({
            target: transaction.providerTxnId,
            set: {
              amountCents: values.amountCents,
              merchantName: values.merchantName,
              category: values.category,
              pending: values.pending,
              date: values.date,
            },
          })
          .returning();
        if (row) addedRows.push(row);
      }

      for (const txn of data.modified) {
        const bankAccountId = accountMap.get(txn.account_id);
        if (!bankAccountId) continue;
        const values = toTransactionValues({ memberId, bankAccountId, txn });
        await this.db
          .insert(transaction)
          .values(values)
          .onConflictDoUpdate({
            target: transaction.providerTxnId,
            set: {
              amountCents: values.amountCents,
              merchantName: values.merchantName,
              category: values.category,
              pending: values.pending,
              date: values.date,
            },
          });
        modifiedCount++;
      }

      const removedIds = removedTransactionIds(data.removed);
      if (removedIds.length > 0) {
        await this.db.delete(transaction).where(inArray(transaction.providerTxnId, removedIds));
        removedCount += removedIds.length;
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    await this.db
      .update(bankConnection)
      .set({ syncCursor: cursor })
      .where(eq(bankConnection.id, connection.id));
    return { added: addedRows, modified: modifiedCount, removed: removedCount };
  }

  async getRecurring(memberId: string) {
    const connection = await this.loadConnection(memberId);
    if (connection) {
      const { data } = await this.plaid.transactionsRecurringGet({
        access_token: connection.accessToken!,
      });
      const streams = [
        ...data.inflow_streams.map((stream) => ({ kind: "income" as const, stream })),
        ...data.outflow_streams.map((stream) => ({ kind: "bill" as const, stream })),
      ];
      for (const { kind, stream } of streams) {
        const values = toRecurringStreamValues({ memberId, kind, stream });
        await this.db
          .insert(recurringStream)
          .values(values)
          .onConflictDoUpdate({
            target: recurringStream.providerStreamId,
            set: {
              name: values.name,
              averageAmountCents: values.averageAmountCents,
              frequency: values.frequency,
              nextExpectedDate: values.nextExpectedDate,
            },
          });
      }
    }
    return this.db.select().from(recurringStream).where(eq(recurringStream.memberId, memberId));
  }
}

// Dev/demo only: Plaid Sandbox has no real Link UI to click through, so this
// mints a sandbox item directly and points a bank_connection at it. Institution
// defaults to Plaid's "First Platypus Bank" sandbox institution.
// https://plaid.com/docs/sandbox/institutions/
export async function createSandboxPlaidItem(
  plaid: PlaidApi,
  db: Database,
  input: { memberId: string; institutionId?: string; institutionName?: string },
): Promise<{ bankConnectionId: string }> {
  const institutionId = input.institutionId ?? "ins_109508";
  const sandboxToken = await plaid.sandboxPublicTokenCreate({
    institution_id: institutionId,
    initial_products: [Products.Transactions],
  });
  const exchange = await plaid.itemPublicTokenExchange({
    public_token: sandboxToken.data.public_token,
  });

  const existing = await db.query.bankConnection.findFirst({
    where: and(eq(bankConnection.memberId, input.memberId), eq(bankConnection.provider, "plaid")),
  });

  if (existing) {
    await db
      .update(bankConnection)
      .set({
        accessToken: exchange.data.access_token,
        providerItemId: exchange.data.item_id,
        institutionName: input.institutionName ?? "Plaid Sandbox Bank",
        syncCursor: null,
      })
      .where(eq(bankConnection.id, existing.id));
    return { bankConnectionId: existing.id };
  }

  const [row] = await db
    .insert(bankConnection)
    .values({
      memberId: input.memberId,
      provider: "plaid",
      accessToken: exchange.data.access_token,
      providerItemId: exchange.data.item_id,
      institutionName: input.institutionName ?? "Plaid Sandbox Bank",
    })
    .returning();
  if (!row) throw new Error("Failed to create bank connection");
  return { bankConnectionId: row.id };
}

// Dev/demo only: drops a fake transaction into the member's Plaid Sandbox
// item (e.g. a $400 charge to demo the unusual-transaction alert), then syncs
// it into our tables right away so it shows up without waiting on a webhook.
// https://plaid.com/docs/api/sandbox/#sandboxtransactionscreate
export async function injectSandboxTransaction(
  plaid: PlaidApi,
  db: Database,
  input: { memberId: string; amountCents: number; merchantName: string; daysAgo?: number },
): Promise<SyncResult> {
  let connection = await db.query.bankConnection.findFirst({
    where: and(eq(bankConnection.memberId, input.memberId), eq(bankConnection.provider, "plaid")),
  });
  // Demo convenience: rather than making the caretaker click a separate
  // "connect sandbox bank" button first, mint one automatically the first
  // time they try to simulate a transaction.
  if (!connection?.accessToken) {
    await createSandboxPlaidItem(plaid, db, { memberId: input.memberId });
    connection = await db.query.bankConnection.findFirst({
      where: and(
        eq(bankConnection.memberId, input.memberId),
        eq(bankConnection.provider, "plaid"),
      ),
    });
  }
  if (!connection?.accessToken) {
    throw new Error("Failed to provision a Plaid sandbox item for this member");
  }

  // Plaid Sandbox only allows the present date or up to 14 days in the past.
  const date = new Date();
  date.setDate(date.getDate() - Math.min(input.daysAgo ?? 0, 14));
  const dateString = date.toISOString().slice(0, 10);

  await plaid.sandboxTransactionsCreate({
    access_token: connection.accessToken,
    transactions: [
      {
        date_transacted: dateString,
        date_posted: dateString,
        // Plaid: positive = money out, matching our stored convention.
        amount: input.amountCents / 100,
        description: input.merchantName,
        iso_currency_code: "USD",
      },
    ],
  });

  return new PlaidProvider(db, plaid).syncTransactions(input.memberId);
}
