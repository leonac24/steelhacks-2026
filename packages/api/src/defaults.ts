import type {
  alertRule,
  budget,
  memberSettings,
  permission,
} from "@steelhacks-2026/db/schema/index";

type NewPermission = Omit<typeof permission.$inferInsert, "memberId">;
type NewAlertRule = Omit<typeof alertRule.$inferInsert, "memberId">;
type NewBudget = Omit<typeof budget.$inferInsert, "memberId">;
type NewSettings = Omit<typeof memberSettings.$inferInsert, "memberId">;

// ElevenLabs premade voices (available on every account by default), picked
// to match each persona's blurb from onboarding: Jay is bright and to the
// point, Robin is warm and a little slower.
export const ASSISTANT_VOICE_IDS: Record<"Jay" | "Robin", string> = {
  Jay: "TxGEqnHWrfWFTfGW9XjX", // Josh
  Robin: "EXAVITQu4vr4xnSDxMaL", // Bella
};

// memberSettings.assistantName is a plain text column (not a pg enum), so a
// row written before this feature existed — or edited outside the app —
// could hold anything. Fall back to the agent's own configured voice rather
// than throwing.
export function voiceIdForAssistant(assistantName: string | undefined): string | undefined {
  return assistantName && assistantName in ASSISTANT_VOICE_IDS
    ? ASSISTANT_VOICE_IDS[assistantName as keyof typeof ASSISTANT_VOICE_IDS]
    : undefined;
}

// Safer changes apply instantly; loosening protections needs caretaker approval.
export const DEFAULT_PERMISSIONS: NewPermission[] = [
  { changeType: "budget_decrease", tier: "instant", onTimeout: "expire" },
  { changeType: "budget_increase", tier: "instant_notify", onTimeout: "expire" },
  { changeType: "reminder_mode_update", tier: "instant_notify", onTimeout: "expire" },
  { changeType: "quiet_hours_update", tier: "instant_notify", onTimeout: "expire" },
  { changeType: "alert_enable", tier: "instant", onTimeout: "expire" },
  { changeType: "alert_disable", tier: "needs_approval", onTimeout: "expire" },
  { changeType: "safety_buffer_increase", tier: "instant", onTimeout: "expire" },
  { changeType: "safety_buffer_decrease", tier: "needs_approval", onTimeout: "expire" },
];

export const DEFAULT_ALERT_RULES: NewAlertRule[] = [
  { type: "shortfall", enabled: true, thresholdCents: null },
  { type: "bill_due_unfunded", enabled: true, thresholdCents: null },
  // Only call about unusual charges at or above this amount.
  { type: "unusual_txn", enabled: true, thresholdCents: 10_000 },
  // Only "significant" deposits — smaller ones don't interrupt anyone.
  { type: "deposit_arrived", enabled: true, thresholdCents: 50_000 },
  { type: "budget_reached", enabled: true, thresholdCents: null },
];

export const DEFAULT_BUDGETS: NewBudget[] = [
  { category: "groceries", monthlyLimitCents: 25_000 },
  { category: "dining", monthlyLimitCents: 6_000 },
  { category: "pharmacy", monthlyLimitCents: 6_000 },
  { category: "other", monthlyLimitCents: 10_000 },
];

export const DEFAULT_SETTINGS: NewSettings = {
  safetyBufferCents: 10_000,
  // A 13-hour window (20:00-09:00) was blocking calls through mid-morning —
  // an actual overnight window is plenty for "don't wake anyone up".
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  maxCallsPerDay: 2,
  reminderMode: "call",
  voiceSpeed: 0.9,
  notifyCaretakerOnUnanswered: true,
};
