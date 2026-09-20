// Pure rules for deciding which alerts to raise and whether we may call right
// now. alerts.ts does the IO around this.
import type { alertRuleType } from "@steelhacks-2026/db/schema/enums";
import {
  formatCentsForSpeech,
  isUnusualTransaction,
  type IsoDate,
  type ShortfallProjection,
  type TxnLike,
} from "@steelhacks-2026/finance";

export type AlertRuleType = (typeof alertRuleType.enumValues)[number];

// Only warn about a bill this close to its due date.
export const BILL_WARNING_DAYS = 3;

export type AlertCandidate = {
  ruleType: AlertRuleType;
  // Unique per member per thing-we-alert-about, so we never call twice.
  dedupeKey: string;
  // Pre-formatted for the voice agent to read verbatim.
  spokenMessage: string;
  // Plain sentence for the caretaker's activity feed.
  summaryText: string;
};

export type AlertRuleConfig = { enabled: boolean; thresholdCents: number | null };

export type CandidateInput = {
  memberId: string;
  preferredName: string;
  today: IsoDate;
  shortfall: ShortfallProjection;
  upcomingBills: { name: string; amountCents: number; dueDate: IsoDate; covered: boolean }[];
  // Transactions that arrived in the latest sync.
  newTransactions: (TxnLike & { id: string; date: IsoDate })[];
  // Everything we knew before this sync, for "is this unusual?".
  transactionHistory: TxnLike[];
  rules: Partial<Record<AlertRuleType, AlertRuleConfig>>;
};

function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function buildCandidates(input: CandidateInput): AlertCandidate[] {
  const { memberId, preferredName } = input;
  const candidates: AlertCandidate[] = [];
  const enabled = (type: AlertRuleType) => input.rules[type]?.enabled ?? false;

  if (enabled("shortfall") && input.shortfall.willShortfall && input.shortfall.date) {
    const short = formatCentsForSpeech(input.shortfall.shortfallCents);
    candidates.push({
      ruleType: "shortfall",
      dedupeKey: `${memberId}:shortfall:${input.shortfall.date}`,
      // formatCentsForSpeech already says "about" when it rounds.
      spokenMessage: `${preferredName}, your money may run short before your next deposit. You'd be ${short} short around that time.`,
      summaryText: `Projected shortfall of ${short} by ${input.shortfall.date}.`,
    });
  }

  if (enabled("bill_due_unfunded")) {
    for (const bill of input.upcomingBills) {
      const days = daysBetween(input.today, bill.dueDate);
      if (bill.covered || days < 0 || days > BILL_WARNING_DAYS) continue;
      const amount = formatCentsForSpeech(bill.amountCents);
      const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      candidates.push({
        ruleType: "bill_due_unfunded",
        dedupeKey: `${memberId}:bill_due_unfunded:${bill.name}:${bill.dueDate}`,
        spokenMessage: `${preferredName}, your ${bill.name} bill of ${amount} is due ${when}, and there may not be enough in your account.`,
        summaryText: `${bill.name} (${amount}) due ${bill.dueDate} isn't covered.`,
      });
    }
  }

  if (enabled("unusual_txn")) {
    const threshold = input.rules.unusual_txn?.thresholdCents ?? 0;
    for (const txn of input.newTransactions) {
      if (txn.amountCents < threshold) continue;
      const result = isUnusualTransaction(txn, input.transactionHistory);
      if (!result.unusual) continue;
      const amount = formatCentsForSpeech(txn.amountCents);
      const merchant = txn.merchantName ?? "a merchant we don't recognize";
      candidates.push({
        ruleType: "unusual_txn",
        dedupeKey: `${memberId}:unusual_txn:${txn.id}`,
        spokenMessage: `${preferredName}, I see a charge of ${amount} at ${merchant}. Does that sound right to you?`,
        summaryText: `Unusual charge: ${amount} at ${merchant} (${result.reasons.join(", ")}).`,
      });
    }
  }

  if (enabled("deposit_arrived")) {
    // Only "significant" deposits are worth interrupting anyone about.
    const threshold = input.rules.deposit_arrived?.thresholdCents ?? 0;
    for (const txn of input.newTransactions) {
      if (txn.amountCents >= 0 || -txn.amountCents < threshold) continue;
      const amount = formatCentsForSpeech(-txn.amountCents);
      const source = txn.merchantName ?? "your bank";
      candidates.push({
        ruleType: "deposit_arrived",
        dedupeKey: `${memberId}:deposit_arrived:${txn.id}`,
        spokenMessage: `Good news, ${preferredName}. Your ${source} deposit of ${amount} arrived.`,
        summaryText: `Deposit arrived: ${amount} from ${source}.`,
      });
    }
  }

  return candidates;
}

// "20:00" → 1200 minutes past midnight.
function minutesOfDay(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

// Quiet hours usually wrap midnight (e.g. 20:00 to 09:00).
export function isQuietHour(localTime: string, start: string, end: string): boolean {
  const now = minutesOfDay(localTime);
  const from = minutesOfDay(start);
  const to = minutesOfDay(end);
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

export type DeliveryCheck = {
  localTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  callsPlacedToday: number;
  maxCallsPerDay: number;
  reminderMode: "call" | "sms" | "off";
};

export type DeliveryDecision =
  | { deliver: true; channel: "call" | "sms" }
  | { deliver: false; reason: "reminders_off" | "quiet_hours" | "daily_limit" };

// Whether we may contact the member right now, and how.
export function checkDelivery(check: DeliveryCheck): DeliveryDecision {
  if (check.reminderMode === "off") return { deliver: false, reason: "reminders_off" };
  if (isQuietHour(check.localTime, check.quietHoursStart, check.quietHoursEnd)) {
    return { deliver: false, reason: "quiet_hours" };
  }
  if (check.callsPlacedToday >= check.maxCallsPerDay) {
    return { deliver: false, reason: "daily_limit" };
  }
  return { deliver: true, channel: check.reminderMode };
}

// Most urgent first, so a single allowed call is the one that matters most.
const PRIORITY: Record<AlertRuleType, number> = {
  bill_due_unfunded: 0,
  unusual_txn: 1,
  shortfall: 2,
  deposit_arrived: 3,
  // Not part of the voice-call candidate pipeline (email-only, see
  // notifications.ts), but still needs a slot in this map's type.
  budget_reached: 4,
};

export function byPriority(a: AlertCandidate, b: AlertCandidate): number {
  return PRIORITY[a.ruleType] - PRIORITY[b.ruleType];
}
