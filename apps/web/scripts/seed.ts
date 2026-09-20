// Demo data: caretaker Maria, member Dorothy ("Dot"). No bank is connected —
// that now happens through /accounts (or the "simulate new user" sign-in
// shortcut), which mints a real Plaid Sandbox item so transaction history
// comes from Plaid's own canned sandbox data instead of something we
// hand-built. Safe to re-run: it deletes the demo users and member first.
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
  budget,
  callSession,
  caretakerLink,
  changeRequest,
  member,
  memberSettings,
  permission,
  user,
} from "@steelhacks-2026/db/schema/index";
import { todayInTimezone } from "@steelhacks-2026/finance";
import { inArray } from "drizzle-orm";

import { auth, db } from "../src/services";

const PASSWORD = "demo-password-123";
const MARIA = { name: "Maria Alvarez", email: "maria@demo.dev", phone: "+14125550187" };
const DOT_PHONE_FALLBACK = "+14125550142";
const DOROTHY = {
  name: "Dorothy Alvarez",
  preferredName: "Dot",
  email: "dorothy@demo.dev",
  phone: DOT_PHONE_FALLBACK,
  pin: "1234",
  timezone: "America/New_York",
};

async function createUser(name: string, email: string) {
  const result = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  return result.user;
}

async function main() {
  const resolvedPhone = process.env.DEMO_MEMBER_PHONE?.trim() || DOT_PHONE_FALLBACK;
  if (!/^\+\d{8,15}$/.test(resolvedPhone)) {
    throw new Error(`DEMO_MEMBER_PHONE must be E.164 (e.g. +14125550142), got "${resolvedPhone}"`);
  }
  DOROTHY.phone = resolvedPhone;

  const today = todayInTimezone(DOROTHY.timezone);
  console.log(`Seeding demo data for ${today}...`);

  // Clean slate. Member rows cascade to everything they own.
  await db.delete(member).where(inArray(member.phoneE164, [resolvedPhone, DOT_PHONE_FALLBACK]));
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
  await db.insert(memberSettings).values({ memberId, ...DEFAULT_SETTINGS });
  await db.insert(budget).values(DEFAULT_BUDGETS.map((b) => ({ memberId, ...b })));
  await db.insert(alertRule).values(DEFAULT_ALERT_RULES.map((r) => ({ memberId, ...r })));
  await db.insert(permission).values(DEFAULT_PERMISSIONS.map((p) => ({ memberId, ...p })));

  // A little history so the caretaker dashboard isn't completely empty
  // before a bank is connected.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const [call] = await db
    .insert(callSession)
    .values({
      memberId,
      direction: "inbound",
      verified: true,
      summaryText: "Dot checked her balance and asked Robin to stop calling about unusual charges.",
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

  await db.insert(activityLog).values([
    {
      memberId,
      type: "call_inbound",
      summaryText: call?.summaryText ?? "Dot called Robin.",
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

  console.log("Done. No bank connected yet — add Demo Bank from /accounts.");
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
