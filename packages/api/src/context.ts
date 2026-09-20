import type { Session } from "@steelhacks-2026/auth";
import type { Database } from "@steelhacks-2026/db";

import type { BankDataProvider, BankProviderKind, SyncResult } from "./providers";
import type { ElevenLabsCallEnv } from "./services/outbound-calls";

export type Context = {
  session: Session | null;
  db: Database;
  bankProvider: BankProviderKind;
  // The actual configured provider (already carries Plaid creds when
  // relevant) — use this instead of calling createBankProvider(db,
  // bankProvider) again, which would construct a Plaid provider with no
  // credentials and throw.
  bankProviderInstance: BankDataProvider;
  // Gates the dev.* procedures that power the live demo.
  devToolsEnabled: boolean;
  // Optional: present only when the ElevenLabs env vars are configured. The
  // dev.* alert tools and cron endpoints use it to place real outbound calls.
  elevenLabsEnv?: ElevenLabsCallEnv;
  // Both set only when BANK_PROVIDER=plaid and creds are present; mint a Plaid
  // Sandbox item / inject a fake transaction so the demo runs without a Link UI.
  createSandboxPlaidItem?: (input: {
    memberId: string;
    institutionId?: string;
    institutionName?: string;
  }) => Promise<{ bankConnectionId: string }>;
  injectPlaidTransaction?: (input: {
    memberId: string;
    amountCents: number;
    merchantName: string;
    daysAgo?: number;
  }) => Promise<SyncResult>;
  // Set whenever auth is wired up; used by the "simulate new user" onboarding
  // shortcut to mint a fresh steward account with no session required yet.
  createUser?: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{ id: string; email: string }>;
};
