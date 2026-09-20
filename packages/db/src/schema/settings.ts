import {
  boolean,
  date,
  integer,
  pgTable,
  real,
  text,
  time,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";
import {
  alertRuleType,
  approvalTimeout,
  briefingFrequency,
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
  // How often the ambient "financial weather" briefing calls. Defaults to
  // weekly; a nil lastBriefingDate is treated as due.
  briefingFrequency: briefingFrequency("briefing_frequency").notNull().default("weekly"),
  // ISO date of the last briefing actually delivered (or null if never).
  lastBriefingDate: date("last_briefing_date", { mode: "string" }),
  // ElevenLabs TTS speed multiplier (1.0 = normal).
  voiceSpeed: real("voice_speed").notNull().default(0.9),
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
