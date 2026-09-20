// Connects the one bank a demo user is allowed to add: "Demo Bank". In Plaid
// mode this mints a real Plaid Sandbox item and syncs it, so the account and
// transactions the caretaker sees afterward are Plaid's own canned sandbox
// history — not something we hand-built — pulled in full once the sandbox
// item is ready (syncTransactions pages through `has_more` on its own).
// In mock mode (no Plaid creds configured) it just creates a starter account
// directly, since there's no sandbox to connect to.
import {
  bankAccount,
  bankConnection,
  member,
  recurringStream,
  transaction,
} from "@steelhacks-2026/db/schema/index";
import { addDays, monthRange, todayInTimezone } from "@steelhacks-2026/finance";
import { and, eq, gte } from "drizzle-orm";

import type { Context } from "../context";
import { DEFAULT_BUDGETS } from "../defaults";
import { injectMockTransaction } from "../providers/mock";

export type ConnectDemoBankResult = { alreadyConnected: boolean; transactionsAdded: number };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Plaid's own recurring-transaction detection (transactionsRecurringGet)
// needs history it doesn't have right after a Sandbox item is created, so
// the "money coming in" box would sit empty until it eventually catches up
// — if it ever does, since Sandbox data doesn't really repeat like a real
// paycheck. Seed one deterministic income stream instead, so that box has
// something to show right away regardless of provider.
async function seedRecurringIncome(
  db: Context["db"],
  memberId: string,
  timezone: string,
): Promise<void> {
  const existing = await db.query.recurringStream.findFirst({
    where: and(eq(recurringStream.memberId, memberId), eq(recurringStream.kind, "income")),
  });
  if (existing) return;

  const today = todayInTimezone(timezone);
  await db.insert(recurringStream).values({
    memberId,
    kind: "income",
    name: "Direct Deposit — Paycheck",
    averageAmountCents: 218_000,
    frequency: "biweekly",
    nextExpectedDate: addDays(today, 7),
  });
}

// Sample merchants for each default budget category, so the budget page and
// weekly notifications have something to show on day one instead of every
// category reading "$0 spent" until real spending (or Plaid Sandbox's own
// canned history, which isn't guaranteed to land in the current month —
// same problem seedRecurringIncome works around for the income box) shows
// up. Only backfills a category that's genuinely empty so far this month,
// so it never doubles up on real spend Plaid did provide.
const STARTER_SPEND: Array<{
  category: string;
  merchantName: string;
  amountCents: number;
  daysAgo: number;
}> = [
  { category: "groceries", merchantName: "Fresh Market", amountCents: 4_230, daysAgo: 2 },
  { category: "dining", merchantName: "Corner Cafe", amountCents: 1_675, daysAgo: 1 },
  { category: "pharmacy", merchantName: "CVS Pharmacy", amountCents: 2_240, daysAgo: 4 },
  { category: "other", merchantName: "Amazon", amountCents: 2_890, daysAgo: 3 },
];

async function seedStarterSpend(
  db: Context["db"],
  memberId: string,
  timezone: string,
): Promise<void> {
  const today = todayInTimezone(timezone);
  const { from } = monthRange(today);
  const spentThisMonth = await db.query.transaction.findMany({
    where: and(eq(transaction.memberId, memberId), gte(transaction.date, from)),
    columns: { category: true },
  });
  const categoriesWithSpend = new Set(spentThisMonth.map((t) => t.category));

  for (const budgetCategory of DEFAULT_BUDGETS) {
    if (categoriesWithSpend.has(budgetCategory.category)) continue;
    const sample = STARTER_SPEND.find((s) => s.category === budgetCategory.category);
    if (!sample) continue;
    await injectMockTransaction(db, {
      memberId,
      amountCents: sample.amountCents,
      merchantName: sample.merchantName,
      category: sample.category,
      daysAgo: sample.daysAgo,
    });
  }
}

export async function connectDemoBank(
  context: Pick<Context, "db" | "bankProvider" | "bankProviderInstance" | "createSandboxPlaidItem">,
  memberId: string,
): Promise<ConnectDemoBankResult> {
  const [existing, m] = await Promise.all([
    context.db.query.bankConnection.findFirst({ where: eq(bankConnection.memberId, memberId) }),
    context.db.query.member.findFirst({ where: eq(member.id, memberId) }),
  ]);
  const timezone = m?.timezone ?? "America/New_York";

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
    await seedRecurringIncome(context.db, memberId, timezone);
    await seedStarterSpend(context.db, memberId, timezone);
    return { alreadyConnected: !!existing, transactionsAdded: sync.added.length };
  }

  if (existing) {
    await seedRecurringIncome(context.db, memberId, timezone);
    await seedStarterSpend(context.db, memberId, timezone);
    return { alreadyConnected: true, transactionsAdded: 0 };
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
  await seedRecurringIncome(context.db, memberId, timezone);
  await seedStarterSpend(context.db, memberId, timezone);
  return { alreadyConnected: false, transactionsAdded: 0 };
}
