import { createAuth } from "@steelhacks-2026/auth";
import {
  createBankProvider,
  createSandboxPlaidItem,
  injectSandboxTransaction,
} from "@steelhacks-2026/api/providers/index";
import { createPlaidClient } from "@steelhacks-2026/api/providers/plaid-client";
import { createDb } from "@steelhacks-2026/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

const plaidConfig =
  ENV.PLAID_CLIENT_ID && ENV.PLAID_SECRET
    ? { clientId: ENV.PLAID_CLIENT_ID, secret: ENV.PLAID_SECRET, env: ENV.PLAID_ENV }
    : undefined;
const plaidClient = plaidConfig ? createPlaidClient(plaidConfig) : undefined;

export const bankProvider = createBankProvider(db, ENV.BANK_PROVIDER, plaidConfig);

// Both only set when BANK_PROVIDER=plaid and Plaid creds are present. Used by
// the dev router and could back a `/demo` "connect sandbox bank" / "inject
// transaction" button.
export const createSandboxItem = plaidClient
  ? (input: { memberId: string; institutionId?: string }) =>
      createSandboxPlaidItem(plaidClient, db, input)
  : undefined;

export const injectPlaidTransaction = plaidClient
  ? (input: { memberId: string; amountCents: number; merchantName: string; daysAgo?: number }) =>
      injectSandboxTransaction(plaidClient, db, input)
  : undefined;
