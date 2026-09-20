// Connects the one bank a demo user is allowed to add: "Demo Bank". In Plaid
// mode this mints a real Plaid Sandbox item and syncs it, so the account and
// transactions the caretaker sees afterward are Plaid's own canned sandbox
// history — not something we hand-built — pulled in full once the sandbox
// item is ready (syncTransactions pages through `has_more` on its own).
// In mock mode (no Plaid creds configured) it just creates a starter account
// directly, since there's no sandbox to connect to.
import { bankAccount, bankConnection } from "@steelhacks-2026/db/schema/index";
import { eq } from "drizzle-orm";

import type { Context } from "../context";

export type ConnectDemoBankResult = { alreadyConnected: boolean; transactionsAdded: number };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectDemoBank(
  context: Pick<Context, "db" | "bankProvider" | "bankProviderInstance" | "createSandboxPlaidItem">,
  memberId: string,
): Promise<ConnectDemoBankResult> {
  const existing = await context.db.query.bankConnection.findFirst({
    where: eq(bankConnection.memberId, memberId),
  });

  if (context.bankProvider === "plaid") {
    if (!existing) {
      if (!context.createSandboxPlaidItem) {
        throw new Error("Plaid isn't configured in this environment");
      }
      await context.createSandboxPlaidItem({ memberId, institutionName: "Demo Bank" });
    }

    // A brand-new Sandbox item sometimes isn't done with its initial pull
    // yet when we call transactionsSync right away — it can come back with
    // nothing added even though the history is seconds away. Retry briefly
    // instead of reporting a connection with no data. This also means
    // re-clicking "Connect" after an earlier attempt came back empty tries
    // the sync again rather than just reporting "already connected".
    let sync = await context.bankProviderInstance.syncTransactions(memberId);
    for (let attempt = 0; sync.added.length === 0 && attempt < 5; attempt++) {
      await sleep(1000);
      sync = await context.bankProviderInstance.syncTransactions(memberId);
    }
    return { alreadyConnected: !!existing, transactionsAdded: sync.added.length };
  }

  if (existing) return { alreadyConnected: true, transactionsAdded: 0 };

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
