// Pure rules for change requests: payload validation, which permission a
// change falls under, the plain-language summary, and state transitions.
// No DB access here so it's easy to test; change-requests.ts does the IO.
import {
  alertRuleType,
  changeType as changeTypeEnum,
  permissionChangeType,
  permissionTier,
  approvalTimeout,
  reminderMode,
} from "@steelhacks-2026/db/schema/enums";
import { formatCentsForSpeech } from "@steelhacks-2026/finance";
import z from "zod";

export type ChangeType = (typeof changeTypeEnum.enumValues)[number];
export type PermissionChangeType = (typeof permissionChangeType.enumValues)[number];
export type PermissionTier = (typeof permissionTier.enumValues)[number];
export type ApprovalTimeout = (typeof approvalTimeout.enumValues)[number];
export type AlertRuleType = (typeof alertRuleType.enumValues)[number];

export const CONFIRMATION_TTL_MS = 5 * 60_000;
export const APPROVAL_WINDOW_MS = 24 * 60 * 60_000;

export const cents = z.number().int().min(0).max(10_000_000);
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const payloadSchemas = {
  budget_update: z.object({
    category: z.string().trim().toLowerCase().min(1).max(40),
    monthlyLimitCents: cents,
  }),
  reminder_mode_update: z.object({ reminderMode: z.enum(reminderMode.enumValues) }),
  quiet_hours_update: z.object({ start: clockTime, end: clockTime }),
  alert_rule_toggle: z.object({ type: z.enum(alertRuleType.enumValues), enabled: z.boolean() }),
  safety_buffer_update: z.object({ safetyBufferCents: cents }),
} satisfies Record<ChangeType, z.ZodType>;

export type ChangePayload<T extends ChangeType> = z.infer<(typeof payloadSchemas)[T]>;

export type ParsedChange = {
  [T in ChangeType]: { changeType: T; payload: ChangePayload<T> };
}[ChangeType];

export function parseChange(changeType: ChangeType, payload: unknown): ParsedChange {
  const schema = payloadSchemas[changeType];
  return { changeType, payload: schema.parse(payload) } as ParsedChange;
}

// What we need to know about the member today to judge a change.
export type CurrentState = {
  budgets: Record<string, number>;
  safetyBufferCents: number;
};

// Direction matters: tightening is safe, loosening needs more oversight.
export function permissionFor(change: ParsedChange, current: CurrentState): PermissionChangeType {
  switch (change.changeType) {
    case "budget_update": {
      const existing = current.budgets[change.payload.category];
      return existing !== undefined && change.payload.monthlyLimitCents <= existing
        ? "budget_decrease"
        : "budget_increase";
    }
    case "alert_rule_toggle":
      return change.payload.enabled ? "alert_enable" : "alert_disable";
    case "safety_buffer_update":
      return change.payload.safetyBufferCents >= current.safetyBufferCents
        ? "safety_buffer_increase"
        : "safety_buffer_decrease";
    case "reminder_mode_update":
    case "quiet_hours_update":
      return change.changeType;
  }
}

const ALERT_LABELS: Record<AlertRuleType, string> = {
  shortfall: "calls when money might run short",
  bill_due_unfunded: "calls when a bill is due without enough money",
  unusual_txn: "calls about unusual charges",
  deposit_arrived: "calls when a significant deposit arrives",
  budget_reached: "emails when a budget is reached",
};

const REMINDER_LABELS = {
  call: "phone calls",
  sms: "text messages",
  off: "no reminders",
} as const;

// "20:00" → "8 PM", "09:30" → "9:30 AM"
export function formatClockForSpeech(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

// One sentence Robin reads back before the member says yes, and the caretaker sees.
export function summarizeChange(change: ParsedChange, current: CurrentState): string {
  switch (change.changeType) {
    case "budget_update": {
      const { category, monthlyLimitCents } = change.payload;
      const next = formatCentsForSpeech(monthlyLimitCents);
      const existing = current.budgets[category];
      if (existing === undefined) return `Set a ${category} budget of ${next} a month.`;
      const verb = monthlyLimitCents > existing ? "Raise" : "Lower";
      return `${verb} the ${category} budget from ${formatCentsForSpeech(existing)} to ${next} a month.`;
    }
    case "reminder_mode_update":
      return `Switch reminders to ${REMINDER_LABELS[change.payload.reminderMode]}.`;
    case "quiet_hours_update":
      return `Don't call between ${formatClockForSpeech(change.payload.start)} and ${formatClockForSpeech(change.payload.end)}.`;
    case "alert_rule_toggle":
      return `Turn ${change.payload.enabled ? "on" : "off"} ${ALERT_LABELS[change.payload.type]}.`;
    case "safety_buffer_update": {
      const { safetyBufferCents } = change.payload;
      const verb = safetyBufferCents >= current.safetyBufferCents ? "Raise" : "Lower";
      return `${verb} the safety cushion from ${formatCentsForSpeech(current.safetyBufferCents)} to ${formatCentsForSpeech(safetyBufferCents)}.`;
    }
  }
}

export type ConfirmRejection = "not_found" | "already_handled" | "expired" | "wrong_call";

type ConfirmableRequest = {
  status: string;
  confirmationExpiresAt: Date;
  sourceCallSessionId: string | null;
};

export function checkConfirmable(
  request: ConfirmableRequest | undefined,
  callSessionId: string | null,
  now: Date,
): ConfirmRejection | null {
  if (!request) return "not_found";
  if (request.status !== "proposed") return "already_handled";
  if (request.confirmationExpiresAt.getTime() <= now.getTime()) return "expired";
  // Only the call that proposed a change may confirm it.
  if (request.sourceCallSessionId !== callSessionId) return "wrong_call";
  return null;
}

export type ConfirmOutcome =
  | { status: "applied"; notifyCaretaker: boolean }
  | { status: "awaiting_approval"; approvalDeadline: Date };

// A missing permission row fails safe: ask the caretaker.
export function outcomeForTier(tier: PermissionTier | undefined, now: Date): ConfirmOutcome {
  switch (tier) {
    case "instant":
      return { status: "applied", notifyCaretaker: false };
    case "instant_notify":
      return { status: "applied", notifyCaretaker: true };
    default:
      return {
        status: "awaiting_approval",
        approvalDeadline: new Date(now.getTime() + APPROVAL_WINDOW_MS),
      };
  }
}

export function outcomeForTimeout(onTimeout: ApprovalTimeout | undefined): "applied" | "expired" {
  // Missing config fails safe: nothing changes without a decision.
  return onTimeout === "apply" ? "applied" : "expired";
}
