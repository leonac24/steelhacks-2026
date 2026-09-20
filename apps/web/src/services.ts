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

// Registered on every new sandbox item so sandboxItemFireWebhook (used to
// nudge injected transactions into transactionsSync right away) has
// somewhere to "deliver" to. Doesn't need to be reachable for that to work,
// but pointing it at our real handler means it'd also work for once this
// runs somewhere with a public URL.
const plaidWebhookUrl = `${ENV.BETTER_AUTH_URL.replace(/\/$/, "")}/api/plaid/webhook`;

// Both only set when BANK_PROVIDER=plaid and Plaid creds are present. Used by
// the dev router and could back a `/demo` "connect sandbox bank" / "inject
// transaction" button.
export const createSandboxItem = plaidClient
  ? (input: { memberId: string; institutionId?: string; institutionName?: string }) =>
      createSandboxPlaidItem(plaidClient, db, { ...input, webhookUrl: plaidWebhookUrl })
  : undefined;

export const injectPlaidTransaction = plaidClient
  ? (input: { memberId: string; amountCents: number; merchantName: string; daysAgo?: number }) =>
      injectSandboxTransaction(plaidClient, db, { ...input, webhookUrl: plaidWebhookUrl })
  : undefined;

// Mints a fresh steward account with no session required — backs the
// sign-in page's "simulate new user" shortcut.
export const createUser = (input: { name: string; email: string; password: string }) =>
  auth.api.signUpEmail({ body: input }).then((result) => result.user);
