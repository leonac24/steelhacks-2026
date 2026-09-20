import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id, timestamps } from "./columns";
import { caretakerRole } from "./enums";

// The older adult. Phone callers are identified by phoneE164 + PIN, not Better Auth.
export const member = pgTable(
  "member",
  {
    id: id(),
    // Only set when the member also uses the native app.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    preferredName: text("preferred_name").notNull(),
    // Not unique on purpose — demo members created via "simulate new user"
    // reuse the same real tester phone across multiple members so outbound
    // demo calls always reach a real handset. Inbound call routing
    // (call-sessions.ts) resolves the caller by phone + PIN together, so a
    // shared phone number across members is only ambiguous for that path.
    phoneE164: text("phone_e164").notNull(),
    pinHash: text("pin_hash").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    language: text("language").notNull().default("en"),
    ...timestamps(),
  },
  // One app login belongs to at most one member, so requireSelfMember can't
  // resolve a user to an arbitrary profile.
  (t) => [uniqueIndex("member_user_id_idx").on(t.userId)],
);

export const caretakerLink = pgTable(
  "caretaker_link",
  {
    id: id(),
    caretakerUserId: text("caretaker_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    role: caretakerRole("role").notNull().default("viewer"),
    memberConsentedAt: timestamp("member_consented_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("caretaker_link_caretaker_member_idx").on(t.caretakerUserId, t.memberId),
    index("caretaker_link_member_idx").on(t.memberId),
  ],
);
