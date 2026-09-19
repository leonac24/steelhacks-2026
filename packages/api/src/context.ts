import type { Session } from "@steelhacks-2026/auth";
import type { Database } from "@steelhacks-2026/db";

import type { BankDataProvider, SyncResult } from "./providers";

export type Context = {
  session: Session | null;
  db: Database;
  bankProvider: BankDataProvider;
  // Both set only when BANK_PROVIDER=plaid; mint/populate a Plaid Sandbox item
  // so the demo has real data to sync against, without a Link UI.
  createSandboxPlaidItem?: (input: {
    memberId: string;
    institutionId?: string;
  }) => Promise<{ bankConnectionId: string }>;
  injectPlaidTransaction?: (input: {
    memberId: string;
    amountCents: number;
    merchantName: string;
    daysAgo?: number;
  }) => Promise<SyncResult>;
};
