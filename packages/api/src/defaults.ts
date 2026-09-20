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
  { changeType: "trusted_contact_update", tier: "needs_approval", onTimeout: "expire" },
];

export const DEFAULT_ALERT_RULES: NewAlertRule[] = [
  { type: "shortfall", enabled: true, thresholdCents: null },
  { type: "bill_due_unfunded", enabled: true, thresholdCents: null },
  // Only call about unusual charges at or above this amount.
  { type: "unusual_txn", enabled: true, thresholdCents: 10_000 },
  { type: "deposit_arrived", enabled: true, thresholdCents: null },
];

export const DEFAULT_BUDGETS: NewBudget[] = [
  { category: "housing", monthlyLimitCents: 95_000 },
  { category: "groceries", monthlyLimitCents: 28_000 },
  { category: "utilities", monthlyLimitCents: 14_000 },
  { category: "phone", monthlyLimitCents: 7_000 },
  { category: "pharmacy", monthlyLimitCents: 6_000 },
  { category: "dining", monthlyLimitCents: 5_000 },
  { category: "other", monthlyLimitCents: 5_000 },
];

export const DEFAULT_SETTINGS: NewSettings = {
  safetyBufferCents: 10_000,
  quietHoursStart: "20:00",
  quietHoursEnd: "09:00",
  maxCallsPerDay: 2,
  reminderMode: "call",
  briefingFrequency: "weekly",
  voiceSpeed: 0.9,
  notifyCaretakerOnUnanswered: true,
};
