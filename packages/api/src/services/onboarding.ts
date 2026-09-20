// Creating a member and getting them ready to use: caretaker link, settings,
// budgets, alert rules, and permission tiers.
import type { Database } from "@steelhacks-2026/db";
import {
  alertRule,
  budget,
  caretakerLink,
  member,
  memberSettings,
  permission,
  user,
} from "@steelhacks-2026/db/schema/index";
import { activityLog } from "@steelhacks-2026/db/schema/index";
import { and, eq, ne } from "drizzle-orm";

import {
  DEFAULT_ALERT_RULES,
  DEFAULT_BUDGETS,
  DEFAULT_PERMISSIONS,
  DEFAULT_SETTINGS,
} from "../defaults";
import { hashPin } from "../lib/pin";
import * as activity from "./activity";
import {
  LoginAlreadyLinkedError,
  NoAccountForEmailError,
  PhoneInUseError,
} from "./onboarding-rules";

// Never return the PIN hash to a client.
const publicMemberColumns = {
  id: member.id,
  userId: member.userId,
  fullName: member.fullName,
  preferredName: member.preferredName,
  phoneE164: member.phoneE164,
  timezone: member.timezone,
  language: member.language,
  createdAt: member.createdAt,
};

export type PublicMember = {
  [K in keyof typeof publicMemberColumns]: (typeof member.$inferSelect)[K];
};

// Postgres unique_violation; the phone index can still trip after our check.
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export type CreateMemberInput = {
  caretakerUserId: string;
  fullName: string;
  preferredName: string;
  // Already normalized to E.164 by the caller.
  phoneE164: string;
  pin: string;
  timezone: string;
  // The member has to agree before a caretaker can watch their money.
  consented: boolean;
};

// Everything a new member needs to work on day one. All writes go in one
// batch: a half-created member would hold the phone number hostage with no
// caretaker able to reach it.
export async function createMember(db: Database, input: CreateMemberInput): Promise<PublicMember> {
  const existing = await db.query.member.findFirst({
    where: eq(member.phoneE164, input.phoneE164),
  });
  if (existing) throw new PhoneInUseError(input.phoneE164);

  const memberId = crypto.randomUUID();
  const consentedAt = input.consented ? new Date() : null;

  try {
    const [created] = await db.batch([
      db
        .insert(member)
        .values({
          id: memberId,
          fullName: input.fullName,
          preferredName: input.preferredName,
          phoneE164: input.phoneE164,
          pinHash: await hashPin(input.pin),
          timezone: input.timezone,
        })
        .returning(publicMemberColumns),
      db.insert(caretakerLink).values({
        caretakerUserId: input.caretakerUserId,
        memberId,
        role: "primary",
        memberConsentedAt: consentedAt,
      }),
      db.insert(memberSettings).values({ memberId, ...DEFAULT_SETTINGS }),
      db.insert(budget).values(DEFAULT_BUDGETS.map((b) => ({ memberId, ...b }))),
      db.insert(alertRule).values(DEFAULT_ALERT_RULES.map((r) => ({ memberId, ...r }))),
      db.insert(permission).values(DEFAULT_PERMISSIONS.map((p) => ({ memberId, ...p }))),
      db.insert(activityLog).values({
        memberId,
        type: "settings_updated",
        summaryText: `${input.preferredName} was set up with the default budgets and alerts.`,
        metadata: { event: "member_created" },
      }),
    ]);
    const row = created[0];
    if (!row) throw new Error("Failed to create member");
    return row;
  } catch (error) {
    // Lost a race against another signup with the same number.
    if (isUniqueViolation(error)) throw new PhoneInUseError(input.phoneE164);
    throw error;
  }
}

export type UpdateMemberInput = {
  memberId: string;
  // Scopes a consent change to the caretaker making it.
  caretakerUserId: string;
  fullName?: string;
  preferredName?: string;
  timezone?: string;
  consented?: boolean;
};

export async function updateMember(db: Database, input: UpdateMemberInput): Promise<PublicMember> {
  const { memberId, caretakerUserId, consented, ...fields } = input;
  const changes = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  const [updated] = Object.keys(changes).length
    ? await db
        .update(member)
        .set(changes)
        .where(eq(member.id, memberId))
        .returning(publicMemberColumns)
    : await db.select(publicMemberColumns).from(member).where(eq(member.id, memberId));
  if (!updated) throw new Error(`Member ${memberId} not found`);

  if (consented !== undefined) {
    // Only this caretaker's link: one caretaker withdrawing consent shouldn't
    // silently change what another caretaker was granted.
    await db
      .update(caretakerLink)
      .set({ memberConsentedAt: consented ? new Date() : null })
      .where(
        and(
          eq(caretakerLink.memberId, memberId),
          eq(caretakerLink.caretakerUserId, caretakerUserId),
        ),
      );
  }

  const changed = [...Object.keys(changes), ...(consented === undefined ? [] : ["consent"])];
  if (changed.length) {
    await activity.log(db, {
      memberId,
      type: "settings_updated",
      summaryText:
        consented === false
          ? "A caretaker withdrew consent to see this member's money."
          : `Profile updated (${changed.join(", ")}).`,
      metadata: { event: "member_updated", fields: changed },
    });
  }
  return updated;
}

// Phone callers prove who they are with this, so changing it is sensitive.
export async function setPin(db: Database, memberId: string, pin: string) {
  const [updated] = await db
    .update(member)
    .set({ pinHash: await hashPin(pin) })
    .where(eq(member.id, memberId))
    .returning({ id: member.id });
  if (!updated) throw new Error(`Member ${memberId} not found`);

  await activity.log(db, {
    memberId,
    type: "settings_updated",
    summaryText: "The phone PIN was changed.",
    // Never store the PIN itself, hashed or otherwise, in the activity feed.
    metadata: { event: "pin_changed" },
  });
  return updated;
}

// Connects a member's own app login (a Better Auth user) to their profile.
export async function linkAppLogin(db: Database, memberId: string, email: string) {
  const account = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (!account) throw new NoAccountForEmailError(email);

  const takenBy = await db.query.member.findFirst({
    where: and(eq(member.userId, account.id), ne(member.id, memberId)),
  });
  if (takenBy) throw new LoginAlreadyLinkedError(email);

  try {
    const [updated] = await db
      .update(member)
      .set({ userId: account.id })
      .where(eq(member.id, memberId))
      .returning({ id: member.id, userId: member.userId });
    if (!updated) throw new Error(`Member ${memberId} not found`);

    await activity.log(db, {
      memberId,
      type: "settings_updated",
      summaryText: "The member's app login was connected.",
      metadata: { event: "app_login_linked" },
    });
    return updated;
  } catch (error) {
    // A unique index on member.user_id makes concurrent links fail here.
    if (isUniqueViolation(error)) throw new LoginAlreadyLinkedError(email);
    throw error;
  }
}
