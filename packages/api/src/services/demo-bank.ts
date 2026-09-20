// Connects the one bank a demo user is allowed to add: "Demo Bank". In Plaid
// mode this mints a real Plaid Sandbox item and syncs it, so the account and
// transactions the caretaker sees afterward are Plaid's own canned sandbox
// history — not something we hand-built — pulled in full on the first sync
// (syncTransactions already pages through `has_more` until it's caught up).
// In mock mode (no Plaid creds configured) it just creates a starter account
// directly, since there's no sandbox to connect to.
import { bankAccount, bankConnection } from "@steelhacks-2026/db/schema/index";
import { eq } from "drizzle-orm";

import type { Context } from "../context";
import { createBankProvider } from "../providers";

export type ConnectDemoBankResult = { alreadyConnected: boolean; transactionsAdded: number };

export async function connectDemoBank(
  context: Pick<Context, "db" | "bankProvider" | "createSandboxPlaidItem">,
  memberId: string,
): Promise<ConnectDemoBankResult> {
  const existing = await context.db.query.bankConnection.findFirst({
    where: eq(bankConnection.memberId, memberId),
  });
  if (existing) return { alreadyConnected: true, transactionsAdded: 0 };

  if (context.bankProvider === "plaid") {
    if (!context.createSandboxPlaidItem) {
      throw new Error("Plaid isn't configured in this environment");
    }
    await context.createSandboxPlaidItem({ memberId, institutionName: "Demo Bank" });
    const sync = await createBankProvider(context.db, context.bankProvider).syncTransactions(
      memberId,
    );
    return { alreadyConnected: false, transactionsAdded: sync.added.length };
  }

  const [connection] = await context.db
    .insert(bankConnection)
    .values({ memberId, provider: "mock", institutionName: "Demo Bank" })
    .returning();
  if (!connection) throw new Error("Failed to create the demo bank connection");
  await context.db.insert(bankAccount).values({
    memberId,
    bankConnectionId: connection.id,
    providerAccountId: `demo_${memberId}_checking`,
    name: "Demo Checking",
    type: "checking",
    mask: "0000",
    currentBalanceCents: 150_000,
    availableBalanceCents: 150_000,
  });
  return { alreadyConnected: false, transactionsAdded: 0 };
}
