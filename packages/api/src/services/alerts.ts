// Proactive alert evaluation + outbound calling, split into a pure evaluator
// (evaluateAlertConditions) and the IO that persists/places calls. Mirrors the
// computeCashPicture split in member-summary so the pure part is testable.
import type { Database } from "@steelhacks-2026/db";
import {
  alertRule,
  alertRuleType,
  alertSent,
  member,
  memberSettings,
  recurringStream,
  transaction,
} from "@steelhacks-2026/db/schema/index";
import {
  addDays,
  formatCentsForSpeech,
  isUnusualTransaction,
  todayInTimezone,
  type IsoDate,
  type TxnLike,
} from "@steelhacks-2026/finance";
import { and, eq, inArray } from "drizzle-orm";

import type { TransactionRow } from "../providers/types";
import { voiceIdForAssistant } from "../defaults";
import * as activity from "./activity";
import { startOutboundSession } from "./call-sessions";
import { memberSummary, type MemberSummary } from "./member-summary";
import { notifyCaretakers } from "./notify";
import type { PlaceCallFn } from "./outbound-calls";

export type AlertRuleType = (typeof alertRuleType.enumValues)[number];

export type AlertCandidate = {
  ruleType: AlertRuleType;
  dedupeKey: string;
  // Outbound first_message override. No amounts or merchant names before PIN.
  firstMessage: string;
  // call_reason, identified, member_preferred_name, call_direction, alert_detail
  dynamicVariables: Record<string, string>;
};

export const RULE_LABELS: Record<AlertRuleType, string> = {
  shortfall: "a possible shortfall",
  bill_due_unfunded: "a bill due soon",
  unusual_txn: "an unusual charge",
  deposit_arrived: "a deposit that arrived",
  budget_reached: "a budget you've reached",
};

const CALL_REASON: Record<AlertRuleType, string> = {
  shortfall: "shortfall_warning",
  bill_due_unfunded: "bill_due_unfunded",
  unusual_txn: "unusual_transaction",
  deposit_arrived: "deposit_arrived",
  budget_reached: "budget_reached",
};

// Alert types that also notify the steward (caretaker) by email — the voice
// call is the member-facing channel, email is the steward-facing one.
const EMAILABLE_TYPES: AlertRuleType[] = ["unusual_txn", "deposit_arrived"];

function buildFirstMessage(ruleType: AlertRuleType, name: string): string {
  switch (ruleType) {
    case "shortfall":
      return `Hi ${name}, it's Robin with a heads-up about your money — but first, could you tell me your PIN?`;
    case "bill_due_unfunded":
      return `Hi ${name}, it's Robin about a bill that's coming due — but first, could you tell me your PIN?`;
    case "unusual_txn":
      return `Hi ${name}, it's Robin about a charge on your account I want to check with you — but first, could you tell me your PIN?`;
    case "deposit_arrived":
      return `Hi ${name}, it's Robin with some good news about a deposit — but first, could you tell me your PIN?`;
    case "budget_reached":
      return `Hi ${name}, it's Robin about a budget you've reached — but first, could you tell me your PIN?`;
  }
}

type UpcomingBillStream = {
  id: string;
  name: string;
  averageAmountCents: number;
  nextExpectedDate: IsoDate | null;
};

type EvaluatorInput = {
  memberId: string;
  preferredName: string;
  today: IsoDate;
  summary: Pick<
    MemberSummary,
    "availableBalanceCents" | "safeToSpendCents" | "shortfall" | "upcomingBills" | "nextIncome"
  >;
  upcomingBillStreams: UpcomingBillStream[];
  recentTransactions: TransactionRow[];
  historyTransactions: TxnLike[];
  rules: Array<{ type: AlertRuleType; enabled: boolean; thresholdCents: number | null }>;
};

export function evaluateAlertConditions(input: EvaluatorInput): AlertCandidate[] {
  const ruleMap = new Map(input.rules.map((r) => [r.type, r]));
  const enabled = (type: AlertRuleType) => ruleMap.get(type)?.enabled === true;
  const thresholdFor = (type: AlertRuleType) => ruleMap.get(type)?.thresholdCents ?? null;

  const base = {
    identified: "yes",
    member_preferred_name: input.preferredName,
    call_direction: "outbound",
  };
  const makeVariables = (ruleType: AlertRuleType, alertDetail: string): Record<string, string> => ({
    ...base,
    call_reason: CALL_REASON[ruleType],
    alert_detail: alertDetail,
  });

  const candidates: AlertCandidate[] = [];

  if (enabled("shortfall") && input.summary.shortfall.willShortfall) {
    const incomeDate = input.summary.nextIncome?.date ?? input.summary.shortfall.date;
    const amount = formatCentsForSpeech(input.summary.shortfall.shortfallCents);
    const income = input.summary.nextIncome?.name ?? "deposit";
    const detail = `You may be short about ${amount} before your next ${income}${
      incomeDate ? ` on ${incomeDate}` : ""
    }.`;
    candidates.push({
      ruleType: "shortfall",
      dedupeKey: `${input.memberId}:shortfall:${incomeDate}`,
      firstMessage: buildFirstMessage("shortfall", input.preferredName),
      dynamicVariables: makeVariables("shortfall", detail),
    });
  }

  if (enabled("bill_due_unfunded")) {
    const horizon = addDays(input.today, 7);
    for (const stream of input.upcomingBillStreams) {
      if (
        stream.nextExpectedDate !== null &&
        stream.nextExpectedDate >= input.today &&
        stream.nextExpectedDate <= horizon &&
        input.summary.availableBalanceCents < stream.averageAmountCents
      ) {
        const detail = `The ${stream.name} bill of ${formatCentsForSpeech(
          stream.averageAmountCents,
        )} is due ${stream.nextExpectedDate} and your balance may not cover it.`;
        candidates.push({
          ruleType: "bill_due_unfunded",
          dedupeKey: `${input.memberId}:bill:${stream.id}:${stream.nextExpectedDate}`,
          firstMessage: buildFirstMessage("bill_due_unfunded", input.preferredName),
          dynamicVariables: makeVariables("bill_due_unfunded", detail),
        });
      }
    }
  }

  if (enabled("unusual_txn")) {
    const largeFloorCents = thresholdFor("unusual_txn") ?? 10_000;
    for (const txn of input.recentTransactions) {
      if (txn.amountCents <= 0) continue;
      const result = isUnusualTransaction(txn, input.historyTransactions, { largeFloorCents });
      if (!result.unusual) continue;
      const detail = `A ${formatCentsForSpeech(txn.amountCents)} charge at ${
        txn.merchantName ?? "a place you've shopped"
      } on ${txn.date} looks unusual.`;
      candidates.push({
        ruleType: "unusual_txn",
        dedupeKey: `${input.memberId}:unusual:${txn.id}`,
        firstMessage: buildFirstMessage("unusual_txn", input.preferredName),
        dynamicVariables: makeVariables("unusual_txn", detail),
      });
    }
  }

  if (enabled("deposit_arrived")) {
    for (const txn of input.recentTransactions) {
      if (txn.amountCents >= 0) continue;
      const detail = `A deposit of ${formatCentsForSpeech(-txn.amountCents)}${
        txn.merchantName ? ` from ${txn.merchantName}` : ""
      } arrived on ${txn.date}.`;
      candidates.push({
        ruleType: "deposit_arrived",
        dedupeKey: `${input.memberId}:deposit:${txn.id}`,
        firstMessage: buildFirstMessage("deposit_arrived", input.preferredName),
        dynamicVariables: makeVariables("deposit_arrived", detail),
      });
    }
  }

  return candidates;
}

// "20:00" → within 20:00–09:00 is true; a window that wraps midnight.
export function isWithinQuietHours(localTime: string, start: string, end: string): boolean {
  const toMinutes = (t: string) => {
    const [h = 0, m = 0] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const t = toMinutes(localTime);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  if (s < e) return t >= s && t < e;
  return t >= s || t < e;
}

export type AlertRunStats = {
  evaluated: number;
  placed: number;
  skipped: number;
  deduped: number;
  failed: number;
};

function localTimeOfDay(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

async function countCallsToday(
  db: Database,
  memberId: string,
  today: IsoDate,
  timezone: string,
): Promise<number> {
  const rows = await db
    .select({ sentAt: alertSent.sentAt })
    .from(alertSent)
    .where(
      and(eq(alertSent.memberId, memberId), inArray(alertSent.status, ["placed", "answered", "unanswered"])),
    );
  return rows.filter((r) => todayInTimezone(timezone, r.sentAt) === today).length;
}

export async function runAlertsForMember(
  db: Database,
  placeCall: PlaceCallFn,
  memberId: string,
  now: Date = new Date(),
): Promise<AlertRunStats> {
  const m = await db.query.member.findFirst({ where: eq(member.id, memberId) });
  const stats: AlertRunStats = { evaluated: 0, placed: 0, skipped: 0, deduped: 0, failed: 0 };
  if (!m) return stats;

  const today = todayInTimezone(m.timezone, now);

  const [summary, settings, rules, billStreams, txns] = await Promise.all([
    memberSummary(db, memberId, now),
    db.query.memberSettings.findFirst({ where: eq(memberSettings.memberId, memberId) }),
    db.select().from(alertRule).where(eq(alertRule.memberId, memberId)),
    db
      .select()
      .from(recurringStream)
      .where(and(eq(recurringStream.memberId, memberId), eq(recurringStream.kind, "bill"))),
    db
      .select()
      .from(transaction)
      .where(and(eq(transaction.memberId, memberId), eq(transaction.pending, false))),
  ]);
  const notifyMap = new Map(rules.map((r) => [r.type, r]));

  const threeDaysAgo = addDays(today, -3);
  const ninetyDaysAgo = addDays(today, -90);
  const recentTransactions = txns.filter((t) => t.date >= threeDaysAgo);
  const historyTransactions: TxnLike[] = txns
    .filter((t) => t.date >= ninetyDaysAgo)
    .map((t) => ({ amountCents: t.amountCents, merchantName: t.merchantName }));

  const candidates = evaluateAlertConditions({
    memberId,
    preferredName: m.preferredName,
    today,
    summary,
    upcomingBillStreams: billStreams.map((s) => ({
      id: s.id,
      name: s.name,
      averageAmountCents: s.averageAmountCents,
      nextExpectedDate: s.nextExpectedDate,
    })),
    recentTransactions,
    historyTransactions,
    rules: rules.map((r) => ({ type: r.type, enabled: r.enabled, thresholdCents: r.thresholdCents })),
  });
  stats.evaluated = candidates.length;

  const maxCallsPerDay = settings?.maxCallsPerDay ?? 2;
  const localHHMM = localTimeOfDay(m.timezone, now);
  let callsToday = await countCallsToday(db, memberId, today, m.timezone);

  for (const candidate of candidates) {
    const [alertRow] = await db
      .insert(alertSent)
      .values({
        memberId,
        ruleType: candidate.ruleType,
        dedupeKey: candidate.dedupeKey,
        channel: "call",
        status: "queued",
      })
      .onConflictDoNothing()
      .returning({ id: alertSent.id });
    if (!alertRow) {
      stats.deduped++;
      continue;
    }

    const rule = notifyMap.get(candidate.ruleType);
    const notifyNester = rule?.notifyNester ?? true;
    const notifySteward = rule?.notifySteward ?? true;
    const summaryText = candidate.dynamicVariables.alert_detail ?? RULE_LABELS[candidate.ruleType];
    const emailSteward = () =>
      EMAILABLE_TYPES.includes(candidate.ruleType) && notifySteward
        ? notifyCaretakers(db, memberId, summaryText)
        : Promise.resolve();

    if (!notifyNester) {
      // The member opted out of this one; still tell the steward by email
      // (if they're opted in) and record it so we don't re-evaluate forever.
      await emailSteward();
      await db.update(alertSent).set({ status: "answered", channel: "email" }).where(eq(alertSent.id, alertRow.id));
      stats.skipped++;
      continue;
    }

    if (settings?.reminderMode !== "call") {
      await db.update(alertSent).set({ status: "skipped" }).where(eq(alertSent.id, alertRow.id));
      stats.skipped++;
      continue;
    }
    if (
      settings &&
      isWithinQuietHours(localHHMM, settings.quietHoursStart, settings.quietHoursEnd)
    ) {
      await db.update(alertSent).set({ status: "skipped" }).where(eq(alertSent.id, alertRow.id));
      stats.skipped++;
      continue;
    }
    if (callsToday >= maxCallsPerDay) {
      await db.update(alertSent).set({ status: "skipped" }).where(eq(alertSent.id, alertRow.id));
      stats.skipped++;
      continue;
    }

    try {
      const { conversationId, callSid } = await placeCall({
        toNumber: m.phoneE164,
        dynamicVariables: candidate.dynamicVariables,
        firstMessage: candidate.firstMessage,
        voiceId: voiceIdForAssistant(settings?.assistantName),
      });
      if (!conversationId) throw new Error("ElevenLabs returned no conversation_id");
      const session = await startOutboundSession(db, {
        memberId,
        conversationId,
        twilioCallSid: callSid,
      });
      await db
        .update(alertSent)
        .set({ status: "placed", callSessionId: session.id })
        .where(eq(alertSent.id, alertRow.id));
      await activity.log(db, {
        memberId,
        type: "alert_sent",
        summaryText: `Robin called ${m.preferredName} about ${RULE_LABELS[candidate.ruleType]}.`,
        metadata: { alertId: alertRow.id, callSessionId: session.id },
        visibleToCaretaker: true,
      });
      await emailSteward();
      stats.placed++;
      callsToday++;
    } catch (error) {
      console.error(`[alerts] failed to place call for ${memberId}`, error);
      await db.update(alertSent).set({ status: "failed" }).where(eq(alertSent.id, alertRow.id));
      stats.failed++;
    }
  }

  return stats;
}

export async function runAlertsForAllMembers(
  db: Database,
  placeCall: PlaceCallFn,
  now: Date = new Date(),
): Promise<Record<string, AlertRunStats>> {
  const members = await db.select({ id: member.id }).from(member);
  const result: Record<string, AlertRunStats> = {};
  for (const m of members) {
    result[m.id] = await runAlertsForMember(db, placeCall, m.id, now);
  }
  return result;
}