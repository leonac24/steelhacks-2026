// Decides what a member should be told about, and calls them if we're allowed.
import type { Database } from "@steelhacks-2026/db";
import {
  alertRule,
  alertSent,
  member,
  memberSettings,
  transaction,
} from "@steelhacks-2026/db/schema/index";
import { localTimeInTimezone, todayInTimezone } from "@steelhacks-2026/finance";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import type { BankDataProvider } from "../providers";
import * as activity from "./activity";
import {
  buildCandidates,
  byPriority,
  checkDelivery,
  type AlertCandidate,
  type AlertRuleConfig,
  type AlertRuleType,
} from "./alert-rules";
import { memberSummary } from "./member-summary";
import { notifyCaretakers } from "./notify";
import * as outboundCalls from "./outbound-calls";
import type { ElevenLabsConfig } from "./outbound-calls";

// How much spending history counts as "normal for this member".
const HISTORY_LIMIT = 200;

export type NewTransaction = {
  id: string;
  amountCents: number;
  merchantName: string | null;
  date: string;
};

// Everything we'd alert about, minus what we've already sent.
export async function evaluate(
  db: Database,
  memberId: string,
  options: { newTransactions?: NewTransaction[]; now?: Date } = {},
): Promise<AlertCandidate[]> {
  const now = options.now ?? new Date();
  const newTransactions = options.newTransactions ?? [];

  const [target, summary, rules, history] = await Promise.all([
    db.query.member.findFirst({ where: eq(member.id, memberId) }),
    memberSummary(db, memberId, now),
    db.select().from(alertRule).where(eq(alertRule.memberId, memberId)),
    db
      .select({
        id: transaction.id,
        amountCents: transaction.amountCents,
        merchantName: transaction.merchantName,
      })
      .from(transaction)
      .where(eq(transaction.memberId, memberId))
      .orderBy(desc(transaction.date))
      .limit(HISTORY_LIMIT),
  ]);
  if (!target) throw new Error(`Member ${memberId} not found`);

  const ruleMap: Partial<Record<AlertRuleType, AlertRuleConfig>> = {};
  for (const rule of rules) {
    ruleMap[rule.type] = { enabled: rule.enabled, thresholdCents: rule.thresholdCents };
  }

  const newIds = new Set(newTransactions.map((t) => t.id));
  const candidates = buildCandidates({
    memberId,
    preferredName: target.preferredName,
    today: summary.today,
    shortfall: summary.shortfall,
    upcomingBills: summary.upcomingBills,
    newTransactions,
    // Don't let the new transactions count as their own precedent.
    transactionHistory: history.filter((t) => !newIds.has(t.id)),
    rules: ruleMap,
  });
  if (candidates.length === 0) return [];

  const seen = await db
    .select({ dedupeKey: alertSent.dedupeKey })
    .from(alertSent)
    .where(
      and(
        eq(alertSent.memberId, memberId),
        inArray(
          alertSent.dedupeKey,
          candidates.map((c) => c.dedupeKey),
        ),
      ),
    );
  const alreadySent = new Set(seen.map((row) => row.dedupeKey));
  return candidates.filter((c) => !alreadySent.has(c.dedupeKey)).sort(byPriority);
}

export type DispatchResult = {
  placed: number;
  skipped: { dedupeKey: string; reason: string }[];
  candidates: number;
};

// Calls the member about the most urgent alerts, respecting quiet hours,
// their daily call cap, and reminder mode.
export async function dispatch(
  db: Database,
  memberId: string,
  options: {
    candidates?: AlertCandidate[];
    newTransactions?: NewTransaction[];
    elevenLabs?: ElevenLabsConfig | null;
    now?: Date;
  } = {},
): Promise<DispatchResult> {
  const now = options.now ?? new Date();
  const candidates = options.candidates ?? (await evaluate(db, memberId, { ...options, now }));
  const skipped: { dedupeKey: string; reason: string }[] = [];
  if (candidates.length === 0) return { placed: 0, skipped, candidates: 0 };

  const [target, settings, rules] = await Promise.all([
    db.query.member.findFirst({ where: eq(member.id, memberId) }),
    db.query.memberSettings.findFirst({ where: eq(memberSettings.memberId, memberId) }),
    db.select().from(alertRule).where(eq(alertRule.memberId, memberId)),
  ]);
  if (!target || !settings) throw new Error(`Member ${memberId} is not fully set up`);
  const notifyMap = new Map(rules.map((r) => [r.type, r]));
  // Caretaker-email alerts (unusual charges, significant deposits) — the
  // voice call below is the member-facing channel, this is the steward one.
  const EMAILABLE_TYPES: AlertRuleType[] = ["unusual_txn", "deposit_arrived"];

  const today = todayInTimezone(target.timezone, now);
  const startOfLocalDay = new Date(`${today}T00:00:00Z`);
  const placedToday = await db
    .select({ id: alertSent.id })
    .from(alertSent)
    .where(and(eq(alertSent.memberId, memberId), gte(alertSent.sentAt, startOfLocalDay)));

  let callsPlacedToday = placedToday.length;
  let placed = 0;

  for (const candidate of candidates) {
    const rule = notifyMap.get(candidate.ruleType);
    const notifyNester = rule?.notifyNester ?? true;
    const notifySteward = rule?.notifySteward ?? true;
    const emailSteward = () =>
      EMAILABLE_TYPES.includes(candidate.ruleType) && notifySteward
        ? notifyCaretakers(db, memberId, candidate.summaryText)
        : Promise.resolve();

    if (!notifyNester) {
      // The member opted out of this one; still tell the steward by email
      // (if they're opted in) and record it so we don't re-evaluate forever.
      await emailSteward();
      await db.insert(alertSent).values({
        memberId,
        ruleType: candidate.ruleType,
        dedupeKey: candidate.dedupeKey,
        channel: "email",
        status: "answered",
        sentAt: now,
      });
      continue;
    }

    const decision = checkDelivery({
      localTime: localTimeInTimezone(target.timezone, now),
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      callsPlacedToday,
      maxCallsPerDay: settings.maxCallsPerDay,
      reminderMode: settings.reminderMode,
    });

    if (!decision.deliver) {
      // Not recorded as sent, so we can try again once it's allowed.
      skipped.push({ dedupeKey: candidate.dedupeKey, reason: decision.reason });
      continue;
    }
    if (decision.channel === "sms") {
      // TODO: send SMS via Twilio once we have credentials.
      skipped.push({ dedupeKey: candidate.dedupeKey, reason: "sms_not_implemented" });
      continue;
    }

    const call = await outboundCalls.place(
      db,
      target,
      candidate,
      options.elevenLabs ?? null,
      settings.voiceSpeed,
    );
    await db.insert(alertSent).values({
      memberId,
      ruleType: candidate.ruleType,
      dedupeKey: candidate.dedupeKey,
      channel: "call",
      status: call.simulated ? "queued" : "placed",
      callSessionId: call.callSessionId,
      sentAt: now,
    });
    await activity.log(db, {
      memberId,
      type: "alert_sent",
      summaryText: call.simulated
        ? `Would call ${target.preferredName}: ${candidate.summaryText}`
        : `Called ${target.preferredName}: ${candidate.summaryText}`,
      metadata: {
        ruleType: candidate.ruleType,
        callSessionId: call.callSessionId,
        simulated: call.simulated,
      },
    });
    await emailSteward();

    callsPlacedToday++;
    placed++;
  }

  return { placed, skipped, candidates: candidates.length };
}

// Used by the daily cron: syncs each member's bank, then calls about anything
// worth calling about.
export async function dispatchAll(
  db: Database,
  options: {
    elevenLabs?: ElevenLabsConfig | null;
    // Pass the app's configured provider to pick up new transactions first.
    bankProvider?: BankDataProvider;
    now?: Date;
  } = {},
) {
  const members = await db.select({ id: member.id }).from(member);
  const results = [];
  for (const row of members) {
    try {
      const newTransactions: NewTransaction[] = options.bankProvider
        ? (await options.bankProvider.syncTransactions(row.id)).added
        : [];
      const result = await dispatch(db, row.id, { ...options, newTransactions });
      results.push({ memberId: row.id, ...result });
    } catch (error) {
      console.error(`[alerts] member ${row.id} failed:`, error);
      results.push({ memberId: row.id, placed: 0, candidates: 0, error: true });
    }
  }
  return results;
}
