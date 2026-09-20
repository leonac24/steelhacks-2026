import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id, timestamps } from "./columns";
import {
  activityType,
  alertChannel,
  alertRuleType,
  alertSendStatus,
  callDirection,
  changeRequestStatus,
  changeType,
  permissionChangeType,
} from "./enums";
import { member } from "./member";

export const callSession = pgTable(
  "call_session",
  {
    id: id(),
    // Null for unknown callers.
    memberId: text("member_id").references(() => member.id, { onDelete: "cascade" }),
    direction: callDirection("direction").notNull(),
    elevenlabsConversationId: text("elevenlabs_conversation_id"),
    twilioCallSid: text("twilio_call_sid"),
    verified: boolean("verified").notNull().default(false),
    pinAttempts: integer("pin_attempts").notNull().default(0),
    summaryText: text("summary_text"),
    // Trimmed post-call transcript: [{ role, message, timeInCallSecs }]
    transcript: jsonb("transcript").$type<
      Array<{ role: "agent" | "user"; message: string | null; timeInCallSecs: number | null }>
    >(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    ...timestamps(),
  },
  (t) => [
    index("call_session_member_idx").on(t.memberId),
    index("call_session_conversation_idx").on(t.elevenlabsConversationId),
  ],
);

export const changeRequest = pgTable(
  "change_request",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    changeType: changeType("change_type").notNull(),
    // The permission this request was judged under, fixed at propose time so
    // timeouts apply the same rule even if budgets change meanwhile.
    permissionChangeType: permissionChangeType("permission_change_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    summaryText: text("summary_text").notNull(),
    status: changeRequestStatus("status").notNull().default("proposed"),
    // Opaque token the agent passes back to confirm; valid for a few minutes.
    confirmationId: text("confirmation_id").notNull().unique(),
    confirmationExpiresAt: timestamp("confirmation_expires_at").notNull(),
    approvalDeadline: timestamp("approval_deadline"),
    sourceCallSessionId: text("source_call_session_id").references(() => callSession.id, {
      onDelete: "set null",
    }),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    ...timestamps(),
  },
  (t) => [index("change_request_member_status_idx").on(t.memberId, t.status)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    type: activityType("type").notNull(),
    summaryText: text("summary_text").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    visibleToCaretaker: boolean("visible_to_caretaker").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("activity_log_member_created_idx").on(t.memberId, t.createdAt)],
);

export const alertSent = pgTable(
  "alert_sent",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    ruleType: alertRuleType("rule_type").notNull(),
    // e.g. "shortfall:2026-10-01" so the same alert isn't sent twice.
    dedupeKey: text("dedupe_key").notNull().unique(),
    channel: alertChannel("channel").notNull(),
    status: alertSendStatus("status").notNull().default("queued"),
    callSessionId: text("call_session_id").references(() => callSession.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    ...timestamps(),
  },
  (t) => [index("alert_sent_member_sent_idx").on(t.memberId, t.sentAt)],
);
