import { boolean, date, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";
import { bankProvider, recurringFrequency, recurringKind, transactionSource } from "./enums";
import { member } from "./member";

export const bankConnection = pgTable(
  "bank_connection",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    provider: bankProvider("provider").notNull(),
    // Server-only. Never select this into a procedure or route response.
    accessToken: text("access_token"),
    // Plaid item_id, used to route webhooks to the right connection.
    providerItemId: text("provider_item_id"),
    institutionName: text("institution_name").notNull(),
    syncCursor: text("sync_cursor"),
    ...timestamps(),
  },
  (t) => [
    index("bank_connection_member_idx").on(t.memberId),
    index("bank_connection_item_idx").on(t.providerItemId),
  ],
);

// Named bankAccount to avoid clashing with Better Auth's `account` table.
export const bankAccount = pgTable(
  "bank_account",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    bankConnectionId: text("bank_connection_id")
      .notNull()
      .references(() => bankConnection.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    // Last 4 digits only.
    mask: text("mask"),
    currentBalanceCents: integer("current_balance_cents").notNull(),
    availableBalanceCents: integer("available_balance_cents").notNull(),
    ...timestamps(),
  },
  (t) => [index("bank_account_member_idx").on(t.memberId)],
);

export const transaction = pgTable(
  "transaction",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    // Null for expenses the member logged by voice.
    bankAccountId: text("bank_account_id").references(() => bankAccount.id, {
      onDelete: "cascade",
    }),
    providerTxnId: text("provider_txn_id").notNull().unique(),
    date: date("date", { mode: "string" }).notNull(),
    // Positive = money out, negative = money in (Plaid's convention).
    amountCents: integer("amount_cents").notNull(),
    merchantName: text("merchant_name"),
    category: text("category").notNull().default("other"),
    pending: boolean("pending").notNull().default(false),
    source: transactionSource("source").notNull().default("bank"),
    ...timestamps(),
  },
  (t) => [index("transaction_member_date_idx").on(t.memberId, t.date)],
);

export const recurringStream = pgTable(
  "recurring_stream",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    kind: recurringKind("kind").notNull(),
    name: text("name").notNull(),
    averageAmountCents: integer("average_amount_cents").notNull(),
    frequency: recurringFrequency("frequency").notNull(),
    nextExpectedDate: date("next_expected_date", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [index("recurring_stream_member_idx").on(t.memberId)],
);
