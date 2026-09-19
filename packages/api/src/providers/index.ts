import type { Database } from "@steelhacks-2026/db";

import { MockProvider } from "./mock";
import { createPlaidClient, type PlaidConfig } from "./plaid-client";
import { PlaidProvider } from "./plaid";
import type { BankDataProvider } from "./types";

export type BankProviderKind = "mock" | "plaid";

// The app passes ENV.BANK_PROVIDER (and Plaid creds, when relevant); this
// package doesn't read env itself.
export function createBankProvider(
  db: Database,
  kind: BankProviderKind,
  plaidConfig?: PlaidConfig,
): BankDataProvider {
  switch (kind) {
    case "mock":
      return new MockProvider(db);
    case "plaid":
      if (!plaidConfig)
        throw new Error("BANK_PROVIDER=plaid requires PLAID_CLIENT_ID/PLAID_SECRET/PLAID_ENV");
      return new PlaidProvider(db, createPlaidClient(plaidConfig));
  }
}

export { injectMockTransaction } from "./mock";
export { createSandboxPlaidItem, injectSandboxTransaction } from "./plaid";
export type { PlaidConfig } from "./plaid-client";
export type { BankDataProvider, SyncResult } from "./types";
