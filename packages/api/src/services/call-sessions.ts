// Call sessions are the trust anchor for the voice line: the ElevenLabs tool
// webhooks only ever see a conversation_id, and we resolve it back to a
// call_session row to learn who's on the line and whether they've verified.
import type { Database } from "@steelhacks-2026/db";
import { callSession, member } from "@steelhacks-2026/db/schema/index";
import { eq } from "drizzle-orm";

import { normalizePhoneE164 } from "../lib/phone";
import { verifyPin } from "../lib/pin";
import * as activity from "./activity";
import { notifyCaretakers } from "./notify";

export type CallSessionRow = typeof callSession.$inferSelect;
export type MemberRow = typeof member.$inferSelect;

export const MAX_PIN_ATTEMPTS = 3;

export async function startInboundSession(
  db: Database,
  input: { callerId: string; conversationId: string; twilioCallSid: string | null },
): Promise<{ session: CallSessionRow; member: MemberRow | null }> {
  // Idempotent on conversation_id: ElevenLabs may retry the initiation webhook.
  const existing = await db.query.callSession.findFirst({
    where: eq(callSession.elevenlabsConversationId, input.conversationId),
  });
  if (existing) {
    const existingMember = existing.memberId
      ? ((await db.query.member.findFirst({ where: eq(member.id, existing.memberId) })) ?? null)
      : null;
    return { session: existing, member: existingMember };
  }

  const phone = normalizePhoneE164(input.callerId);
  const callerMember = phone
    ? ((await db.query.member.findFirst({ where: eq(member.phoneE164, phone) })) ?? null)
    : null;

  const [session] = await db
    .insert(callSession)
    .values({
      memberId: callerMember?.id ?? null,
      direction: "inbound",
      elevenlabsConversationId: input.conversationId,
      twilioCallSid: input.twilioCallSid,
      verified: false,
    })
    .returning();
  if (!session) throw new Error("Failed to create call session");

  return { session, member: callerMember };
}

export async function startOutboundSession(
  db: Database,
  input: { memberId: string; conversationId: string; twilioCallSid: string | null },
): Promise<CallSessionRow> {
  const [session] = await db
    .insert(callSession)
    .values({
      memberId: input.memberId,
      direction: "outbound",
      elevenlabsConversationId: input.conversationId,
      twilioCallSid: input.twilioCallSid,
      verified: false,
    })
    .returning();
  if (!session) throw new Error("Failed to create call session");
  return session;
}

export async function getSessionByConversationId(
  db: Database,
  conversationId: string,
): Promise<{ session: CallSessionRow; member: MemberRow | null } | null> {
  const session = await db.query.callSession.findFirst({
    where: eq(callSession.elevenlabsConversationId, conversationId),
  });
  if (!session) return null;
  const sessionMember = session.memberId
    ? ((await db.query.member.findFirst({ where: eq(member.id, session.memberId) })) ?? null)
    : null;
  return { session, member: sessionMember };
}

export type PinResult =
  | { ok: true }
  | { ok: false; reason: "no_session" | "no_member" | "locked" }
  | { ok: false; reason: "wrong_pin"; attemptsRemaining: number };

export async function verifySessionPin(
  db: Database,
  input: { conversationId: string; pin: string },
): Promise<PinResult> {
  const resolved = await getSessionByConversationId(db, input.conversationId);
  if (!resolved) return { ok: false, reason: "no_session" };
  const { session, member: sessionMember } = resolved;
  if (!sessionMember) return { ok: false, reason: "no_member" };

  // locked = !verified && pinAttempts >= MAX_PIN_ATTEMPTS, checked BEFORE verifying.
  if (!session.verified && session.pinAttempts >= MAX_PIN_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }

  // The agent is only instructed to pass "digits only" — nothing enforces
  // that. Speech-to-text + an LLM tool call routinely produces "1 2 3 4",
  // "1-2-3-4", or "it's 1234", none of which will ever bcrypt-match a hash
  // made from a plain "1234", so a correct PIN would always come back
  // "wrong". Strip everything but digits before comparing.
  const normalizedPin = input.pin.replace(/\D/g, "");

  if (normalizedPin && (await verifyPin(normalizedPin, sessionMember.pinHash))) {
    await db.update(callSession).set({ verified: true }).where(eq(callSession.id, session.id));
    return { ok: true };
  }

  const attempts = session.pinAttempts + 1;
  await db.update(callSession).set({ pinAttempts: attempts }).where(eq(callSession.id, session.id));

  if (attempts >= MAX_PIN_ATTEMPTS) {
    const summary = `${sessionMember.preferredName}'s phone line was locked after ${MAX_PIN_ATTEMPTS} failed PIN attempts.`;
    await activity.log(db, {
      memberId: sessionMember.id,
      type: "pin_locked",
      summaryText: summary,
      metadata: { callSessionId: session.id },
      visibleToCaretaker: true,
    });
    await notifyCaretakers(db, sessionMember.id, summary);
  }

  return { ok: false, reason: "wrong_pin", attemptsRemaining: MAX_PIN_ATTEMPTS - attempts };
}

export async function recordPostCall(
  db: Database,
  input: {
    conversationId: string;
    summaryText: string | null;
    transcript: Array<{
      role: "agent" | "user";
      message: string | null;
      timeInCallSecs: number | null;
    }> | null;
    endedAt: Date;
  },
): Promise<CallSessionRow | null> {
  const resolved = await getSessionByConversationId(db, input.conversationId);
  if (!resolved) return null;
  const { session, member: sessionMember } = resolved;

  const alreadyEnded = session.endedAt !== null;

  const [updated] = await db
    .update(callSession)
    .set({ summaryText: input.summaryText, transcript: input.transcript, endedAt: input.endedAt })
    .where(eq(callSession.id, session.id))
    .returning();
  if (!updated) return null;

  // Unknown callers have no member row, and activity_log.memberId is notNull.
  if (!sessionMember) return updated;

  // Idempotent: don't double-log when the webhook redelivers.
  if (!alreadyEnded) {
    await activity.log(db, {
      memberId: sessionMember.id,
      type: session.direction === "inbound" ? "call_inbound" : "call_outbound",
      summaryText: input.summaryText ?? `Robin spoke with ${sessionMember.preferredName}.`,
      metadata: { callSessionId: session.id },
      visibleToCaretaker: true,
    });
  }

  return updated;
}
