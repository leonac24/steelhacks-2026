import { pgEnum } from "drizzle-orm/pg-core";

export const caretakerRole = pgEnum("caretaker_role", ["primary", "viewer"]);

export const bankProvider = pgEnum("bank_provider", ["mock", "plaid"]);

export const transactionSource = pgEnum("transaction_source", ["bank", "voice_log"]);

export const recurringKind = pgEnum("recurring_kind", ["bill", "income"]);

// Mirrors Plaid's recurring stream frequencies.
export const recurringFrequency = pgEnum("recurring_frequency", [
  "weekly",
  "biweekly",
  "semi_monthly",
  "monthly",
  "annually",
  "unknown",
]);

export const reminderMode = pgEnum("reminder_mode", ["call", "sms", "off"]);

export const alertRuleType = pgEnum("alert_rule_type", [
  "shortfall",
  "bill_due_unfunded",
  "unusual_txn",
  "deposit_arrived",
]);

// What a member can ask June to change.
export const changeType = pgEnum("change_type", [
  "budget_update",
  "reminder_mode_update",
  "quiet_hours_update",
  "alert_rule_toggle",
  "safety_buffer_update",
  "trusted_contact_update",
]);

// Permissions are finer than change types because direction matters: lowering
// a budget is instant, raising one notifies the caretaker. The change-request
// service maps (changeType, payload) to one of these.
export const permissionChangeType = pgEnum("permission_change_type", [
  "budget_decrease",
  "budget_increase",
  "reminder_mode_update",
  "quiet_hours_update",
  "alert_enable",
  "alert_disable",
  "safety_buffer_increase",
  "safety_buffer_decrease",
  "trusted_contact_update",
]);

export const permissionTier = pgEnum("permission_tier", [
  "instant",
  "instant_notify",
  "needs_approval",
]);

export const approvalTimeout = pgEnum("approval_timeout", ["apply", "expire"]);

export const changeRequestStatus = pgEnum("change_request_status", [
  "proposed",
  "applied",
  "awaiting_approval",
  "rejected",
  "expired",
]);

export const activityType = pgEnum("activity_type", [
  "call_inbound",
  "call_outbound",
  "pin_locked",
  "change_proposed",
  "change_applied",
  "change_awaiting_approval",
  "change_approved",
  "change_rejected",
  "change_expired",
  "alert_sent",
  "expense_logged",
  "bank_synced",
  "settings_updated",
]);

export const alertChannel = pgEnum("alert_channel", ["call", "sms"]);

export const alertSendStatus = pgEnum("alert_send_status", [
  "queued",
  "placed",
  "answered",
  "unanswered",
  "failed",
  "skipped",
]);

export const callDirection = pgEnum("call_direction", ["inbound", "outbound"]);
