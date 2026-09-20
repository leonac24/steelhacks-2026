import { boolean, integer, pgTable, real, text, time, uniqueIndex } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";
import {
  alertRuleType,
  approvalTimeout,
  permissionChangeType,
  permissionTier,
  reminderMode,
} from "./enums";
import { member } from "./member";

export const budget = pgTable(
  "budget",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    monthlyLimitCents: integer("monthly_limit_cents").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("budget_member_category_idx").on(t.memberId, t.category)],
);

export const memberSettings = pgTable("member_settings", {
  id: id(),
  memberId: text("member_id")
    .notNull()
    .unique()
    .references(() => member.id, { onDelete: "cascade" }),
  safetyBufferCents: integer("safety_buffer_cents").notNull().default(10_000),
  // Local times in the member's timezone, e.g. "20:00".
  quietHoursStart: time("quiet_hours_start").notNull().default("20:00"),
  quietHoursEnd: time("quiet_hours_end").notNull().default("09:00"),
  maxCallsPerDay: integer("max_calls_per_day").notNull().default(2),
  reminderMode: reminderMode("reminder_mode").notNull().default("call"),
  // ElevenLabs TTS speed multiplier (1.0 = normal).
  voiceSpeed: real("voice_speed").notNull().default(0.9),
  // Which assistant persona the member picked during onboarding.
  assistantName: text("assistant_name").notNull().default("Jay"),
  notifyCaretakerOnUnanswered: boolean("notify_caretaker_on_unanswered").notNull().default(true),
  ...timestamps(),
});

export const alertRule = pgTable(
  "alert_rule",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    type: alertRuleType("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    thresholdCents: integer("threshold_cents"),
    // Who gets told: the caretaker by email, the member by phone call. Set
    // during onboarding, editable later from settings.
    notifySteward: boolean("notify_steward").notNull().default(true),
    notifyNester: boolean("notify_nester").notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("alert_rule_member_type_idx").on(t.memberId, t.type)],
);

export const permission = pgTable(
  "permission",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    changeType: permissionChangeType("change_type").notNull(),
    tier: permissionTier("tier").notNull(),
    onTimeout: approvalTimeout("on_timeout").notNull().default("expire"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("permission_member_change_type_idx").on(t.memberId, t.changeType)],
);
