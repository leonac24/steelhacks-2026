import type { Database } from "@steelhacks-2026/db";

import { MockProvider } from "./mock";
import type { BankDataProvider } from "./types";

export type BankProviderKind = "mock" | "plaid";

// The app passes ENV.BANK_PROVIDER; this package doesn't read env itself.
export function createBankProvider(db: Database, kind: BankProviderKind): BankDataProvider {
  switch (kind) {
    case "mock":
      return new MockProvider(db);
    case "plaid":
      // TODO(milestone 8): return new PlaidProvider(db, plaidConfig).
      throw new Error("PlaidProvider is not implemented yet; set BANK_PROVIDER=mock");
  }
}

export type { BankDataProvider, SyncResult } from "./types";
