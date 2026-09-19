import type { bankAccount, recurringStream, transaction } from "@steelhacks-2026/db/schema/index";

export type BankAccountRow = typeof bankAccount.$inferSelect;
export type TransactionRow = typeof transaction.$inferSelect;
export type RecurringStreamRow = typeof recurringStream.$inferSelect;

export type SyncResult = {
  added: TransactionRow[];
  modified: number;
  removed: number;
};

// Where bank data comes from. Implementations write what they fetch into our
// tables, so everything downstream reads from the DB.
export interface BankDataProvider {
  // Refreshes balances and returns the member's accounts.
  getAccounts(memberId: string): Promise<BankAccountRow[]>;
  // Pulls transactions since the stored cursor; `added` feeds alert evaluation.
  syncTransactions(memberId: string): Promise<SyncResult>;
  getRecurring(memberId: string): Promise<RecurringStreamRow[]>;
}
