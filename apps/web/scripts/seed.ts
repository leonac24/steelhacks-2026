// Demo data: caretaker Maria, member Dorothy ("Dot"), 90 days of checking
// history. Safe to re-run: it deletes the demo users and member first.
// Run with `pnpm db:seed` from the repo root.
import {
  DEFAULT_ALERT_RULES,
  DEFAULT_BUDGETS,
  DEFAULT_PERMISSIONS,
  DEFAULT_SETTINGS,
} from "@steelhacks-2026/api/defaults";
import { hashPin } from "@steelhacks-2026/api/lib/pin";
import {
  activityLog,
  alertRule,
  alertSent,
  bankAccount,
  bankConnection,
  budget,
  callSession,
  caretakerLink,
  changeRequest,
  member,
  memberSettings,
  permission,
  recurringStream,
  transaction,
  trustedContact,
  user,
} from "@steelhacks-2026/db/schema/index";
import {
  addDays,
  formatCentsForSpeech,
  nextDayOfMonth,
  todayInTimezone,
} from "@steelhacks-2026/finance";
import { eq, inArray } from "drizzle-orm";

import { auth, db } from "../src/services";

const PASSWORD = "demo-password-123";
const MARIA = { name: "Maria Alvarez", email: "maria@demo.dev", phone: "+14125550187" };
const DOROTHY = {
  name: "Dorothy Alvarez",
  preferredName: "Dot",
  email: "dorothy@demo.dev",
  phone: "+14125550142",
  pin: "1234",
  timezone: "America/New_York",
};
const CURRENT_BALANCE_CENTS = 131_742;

// Deterministic randomness so every seed produces the same history.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(42);
const between = (min: number, max: number) => Math.round(min + random() * (max - min));

type SeedTxn = { date: string; amountCents: number; merchantName: string; category: string };

// Monthly bills by day of month. Also used for the recurring streams.
const MONTHLY_BILLS = [
  { day: 1, name: "Oakmont Senior Apartments", category: "housing", min: 95_000, max: 95_000 },
  { day: 8, name: "Verizon Wireless", category: "phone", min: 6_499, max: 6_499 },
  { day: 15, name: "Duquesne Light", category: "utilities", min: 7_800, max: 11_200 },
  { day: 20, name: "Pennsylvania American Water", category: "utilities", min: 3_800, max: 4_600 },
];
const SOCIAL_SECURITY = { day: 3, name: "Social Security", amountCents: 184_200 };

function buildHistory(today: string): SeedTxn[] {
  const txns: SeedTxn[] = [];
  for (let offset = -90; offset <= 0; offset++) {
    const date = addDays(today, offset);
    const d = new Date(`${date}T00:00:00Z`);
    const dom = d.getUTCDate();
    const weekday = d.getUTCDay();

    if (dom === SOCIAL_SECURITY.day) {
      txns.push({
        date,
        amountCents: -SOCIAL_SECURITY.amountCents,
        merchantName: SOCIAL_SECURITY.name,
        category: "income",
      });
    }
    for (const bill of MONTHLY_BILLS) {
      if (dom === bill.day) {
        txns.push({
          date,
          amountCents: between(bill.min, bill.max),
          merchantName: bill.name,
          category: bill.category,
        });
      }
    }
    if (weekday === 2) {
      txns.push({
        date,
        amountCents: between(4_500, 9_500),
        merchantName: "Giant Eagle",
        category: "groceries",
      });
    }
    // Pharmacy every other Friday.
    if (weekday === 5 && Math.floor((offset + 90) / 7) % 2 === 0) {
      txns.push({
        date,
        amountCents: between(1_200, 3_500),
        merchantName: "CVS Pharmacy",
        category: "pharmacy",
      });
    }
    if (weekday === 6 && random() < 0.4) {
      txns.push({
        date,
        amountCents: between(1_800, 3_200),
        merchantName: "Eat'n Park",
        category: "dining",
      });
    }
    if (weekday === 0 && random() < 0.5) {
      txns.push({ date, amountCents: 2_000, merchantName: "St. Anne Parish", category: "other" });
    }
  }
  return txns;
}

async function createUser(name: string, email: string) {
  const result = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  return result.user;
}

async function main() {
  const today = todayInTimezone(DOROTHY.timezone);
  console.log(`Seeding demo data for ${today}...`);

  // Clean slate. Member rows cascade to everything they own.
  await db.delete(member).where(eq(member.phoneE164, DOROTHY.phone));
  await db.delete(user).where(inArray(user.email, [MARIA.email, DOROTHY.email]));

  const maria = await createUser(MARIA.name, MARIA.email);
  const dorothyUser = await createUser(DOROTHY.name, DOROTHY.email);

  const [dot] = await db
    .insert(member)
    .values({
      userId: dorothyUser.id,
      fullName: DOROTHY.name,
      preferredName: DOROTHY.preferredName,
      phoneE164: DOROTHY.phone,
      pinHash: await hashPin(DOROTHY.pin),
      timezone: DOROTHY.timezone,
    })
    .returning();
  if (!dot) throw new Error("Failed to create member");
  const memberId = dot.id;

  await db.insert(caretakerLink).values({
    caretakerUserId: maria.id,
    memberId,
    role: "primary",
    memberConsentedAt: new Date(),
  });
  await db.insert(trustedContact).values({
    memberId,
    name: "Maria",
    phoneE164: MARIA.phone,
    relationship: "daughter",
  });
  await db.insert(memberSettings).values({ memberId, ...DEFAULT_SETTINGS });
  await db.insert(budget).values(DEFAULT_BUDGETS.map((b) => ({ memberId, ...b })));
  await db.insert(alertRule).values(DEFAULT_ALERT_RULES.map((r) => ({ memberId, ...r })));
  await db.insert(permission).values(DEFAULT_PERMISSIONS.map((p) => ({ memberId, ...p })));

  // Bank: one mock checking account.
  const [connection] = await db
    .insert(bankConnection)
    .values({ memberId, provider: "mock", institutionName: "Mock Community Bank" })
    .returning();
  if (!connection) throw new Error("Failed to create bank connection");

  const history = buildHistory(today);
  // Anything from the last two days is still pending.
  const pendingFrom = addDays(today, -1);
  const pendingCents = history
    .filter((t) => t.date >= pendingFrom && t.amountCents > 0)
    .reduce((sum, t) => sum + t.amountCents, 0);

  const [checking] = await db
    .insert(bankAccount)
    .values({
      memberId,
      bankConnectionId: connection.id,
      providerAccountId: `mock_${memberId}_checking`,
      name: "Everyday Checking",
      type: "checking",
      mask: "4821",
      currentBalanceCents: CURRENT_BALANCE_CENTS,
      availableBalanceCents: CURRENT_BALANCE_CENTS - pendingCents,
    })
    .returning();
  if (!checking) throw new Error("Failed to create bank account");

  const seededTxns = await db
    .insert(transaction)
    .values(
      history.map((t, i) => ({
        memberId,
        bankAccountId: checking.id,
        providerTxnId: `mock_${memberId}_${i}`,
        date: t.date,
        amountCents: t.amountCents,
        merchantName: t.merchantName,
        category: t.category,
        pending: t.date >= pendingFrom && t.amountCents > 0,
        source: "bank" as const,
      })),
    )
    .returning({ createdAt: transaction.createdAt });

  // Mark seeded history as already synced so only later rows count as "new".
  const lastSeeded = seededTxns.reduce(
    (max, t) => (t.createdAt > max ? t.createdAt : max),
    new Date(0),
  );
  await db
    .update(bankConnection)
    .set({ syncCursor: lastSeeded.toISOString() })
    .where(eq(bankConnection.id, connection.id));

  await db.insert(recurringStream).values([
    {
      memberId,
      kind: "income",
      name: SOCIAL_SECURITY.name,
      averageAmountCents: SOCIAL_SECURITY.amountCents,
      frequency: "monthly",
      nextExpectedDate: nextDayOfMonth(today, SOCIAL_SECURITY.day),
    },
    ...MONTHLY_BILLS.map((b) => ({
      memberId,
      kind: "bill" as const,
      name: b.name,
      averageAmountCents: Math.round((b.min + b.max) / 2),
      frequency: "monthly" as const,
      nextExpectedDate: nextDayOfMonth(today, b.day),
    })),
  ]);

  // A little history so the caretaker dashboard isn't empty.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const [call] = await db
    .insert(callSession)
    .values({
      memberId,
      direction: "inbound",
      verified: true,
      summaryText: "Dot checked her balance and asked June to stop calling about unusual charges.",
      startedAt: hoursAgo(20),
      endedAt: new Date(hoursAgo(20).getTime() + 4 * 60_000),
    })
    .returning();

  await db.insert(changeRequest).values({
    memberId,
    changeType: "alert_rule_toggle",
    permissionChangeType: "alert_disable",
    payload: { type: "unusual_txn", enabled: false },
    summaryText: "Turn off calls about unusual charges",
    status: "awaiting_approval",
    confirmationId: crypto.randomUUID().slice(0, 8),
    confirmationExpiresAt: hoursAgo(19.9),
    approvalDeadline: new Date(hoursAgo(20).getTime() + 24 * 3_600_000),
    sourceCallSessionId: call?.id,
  });

  const lastDeposit = [...history].reverse().find((t) => t.category === "income");
  if (lastDeposit) {
    await db.insert(alertSent).values({
      memberId,
      ruleType: "deposit_arrived",
      dedupeKey: `${memberId}:deposit_arrived:${lastDeposit.date}`,
      channel: "call",
      status: "answered",
      sentAt: new Date(`${lastDeposit.date}T14:00:00Z`),
    });
  }

  const depositActivity = lastDeposit
    ? [
        {
          memberId,
          type: "alert_sent" as const,
          summaryText: `June called Dot: her Social Security deposit of ${formatCentsForSpeech(-lastDeposit.amountCents)} arrived.`,
          createdAt: new Date(`${lastDeposit.date}T14:00:00Z`),
        },
      ]
    : [];

  await db.insert(activityLog).values([
    ...depositActivity,
    {
      memberId,
      type: "bank_synced",
      summaryText: "Bank account synced (Mock Community Bank).",
      createdAt: hoursAgo(26),
    },
    {
      memberId,
      type: "call_inbound",
      summaryText: call?.summaryText ?? "Dot called June.",
      metadata: { callSessionId: call?.id },
      createdAt: hoursAgo(20),
    },
    {
      memberId,
      type: "change_awaiting_approval",
      summaryText: "Dot asked to turn off calls about unusual charges. Needs your approval.",
      createdAt: hoursAgo(20),
    },
  ]);

  console.log(`Done. ${history.length} transactions.`);
  console.log(`  Caretaker: ${MARIA.email} / ${PASSWORD}`);
  console.log(`  Member app: ${DOROTHY.email} / ${PASSWORD}`);
  console.log(`  Phone: ${DOROTHY.phone}, PIN ${DOROTHY.pin}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
