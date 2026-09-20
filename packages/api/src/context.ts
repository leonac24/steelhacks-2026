import type { Session } from "@steelhacks-2026/auth";
import type { Database } from "@steelhacks-2026/db";

import type { BankProviderKind, SyncResult } from "./providers";
import type { ElevenLabsConfig } from "./services/outbound-calls";

export type Context = {
  session: Session | null;
  db: Database;
  bankProvider: BankProviderKind;
  // Gates the dev.* procedures that power the live demo.
  devToolsEnabled: boolean;
  // Null when no ElevenLabs credentials are configured; calls are then logged
  // instead of placed.
  elevenLabs: ElevenLabsConfig | null;
  // Both set only when BANK_PROVIDER=plaid and creds are present; mint a Plaid
  // Sandbox item / inject a fake transaction so the demo runs without a Link UI.
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
