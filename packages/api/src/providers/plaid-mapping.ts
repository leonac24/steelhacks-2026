// Pure Plaid -> our-schema mappers. No IO, so these are unit-tested directly;
// providers/plaid.ts only wires them to fetch calls and db writes.
import type { bankAccount, recurringStream, transaction } from "@steelhacks-2026/db/schema/index";
import type {
  AccountBase,
  RemovedTransaction,
  Transaction as PlaidTransaction,
  TransactionStream,
} from "plaid";

export type TransactionInsert = typeof transaction.$inferInsert;
export type BankAccountInsert = typeof bankAccount.$inferInsert;
export type RecurringStreamInsert = typeof recurringStream.$inferInsert;

// Our category vocabulary (see apps/web/scripts/seed.ts and budget.category):
// housing, phone, utilities, income, groceries, pharmacy, dining, other.
// Mapped from Plaid's personal_finance_category taxonomy (primary + detailed).
export function mapPersonalFinanceCategory(
  pfc: { primary: string; detailed: string } | null | undefined,
): string {
  if (!pfc) return "other";
  switch (pfc.primary) {
    case "INCOME":
    case "TRANSFER_IN":
      return "income";
    case "MEDICAL":
      return "pharmacy";
    case "FOOD_AND_DRINK":
      return pfc.detailed === "FOOD_AND_DRINK_GROCERIES" ? "groceries" : "dining";
    case "RENT_AND_UTILITIES":
      if (pfc.detailed === "RENT_AND_UTILITIES_RENT") return "housing";
      if (pfc.detailed === "RENT_AND_UTILITIES_TELEPHONE") return "phone";
      return "utilities";
    default:
      return "other";
  }
}

export function toTransactionValues(input: {
  memberId: string;
  bankAccountId: string;
  txn: PlaidTransaction;
}): TransactionInsert {
  const { memberId, bankAccountId, txn } = input;
  return {
    memberId,
    bankAccountId,
    providerTxnId: txn.transaction_id,
    date: txn.date,
    // Plaid: positive = money out, negative = money in. Same convention we store.
    amountCents: Math.round(txn.amount * 100),
    merchantName: txn.merchant_name ?? txn.name ?? null,
    category: mapPersonalFinanceCategory(txn.personal_finance_category),
    pending: txn.pending,
    source: "bank",
  };
}

export function removedTransactionIds(removed: RemovedTransaction[]): string[] {
  return removed.map((r) => r.transaction_id).filter((id): id is string => id != null);
}

export function toBankAccountValues(input: {
  memberId: string;
  bankConnectionId: string;
  account: AccountBase;
}): BankAccountInsert {
  const { memberId, bankConnectionId, account } = input;
  return {
    memberId,
    bankConnectionId,
    providerAccountId: account.account_id,
    name: account.name,
    type: account.subtype ?? account.type,
    mask: account.mask ?? null,
    currentBalanceCents: Math.round((account.balances.current ?? 0) * 100),
    availableBalanceCents: Math.round(
      (account.balances.available ?? account.balances.current ?? 0) * 100,
    ),
  };
}

// TODO: verify TransactionStream field names against
// https://plaid.com/docs/api/products/transactions/#transactionsrecurringget
// (average_amount, predicted_next_date, frequency casing) before relying on
// this in production; confirmed only against the Plaid Node SDK's shipped types.
export function mapRecurringFrequency(
  frequency: TransactionStream["frequency"],
): RecurringStreamInsert["frequency"] {
  const value = frequency.toLowerCase();
  const known: RecurringStreamInsert["frequency"][] = [
    "weekly",
    "biweekly",
    "semi_monthly",
    "monthly",
    "annually",
    "unknown",
  ];
  return (known as string[]).includes(value)
    ? (value as RecurringStreamInsert["frequency"])
    : "unknown";
}

export function toRecurringStreamValues(input: {
  memberId: string;
  kind: "bill" | "income";
  stream: TransactionStream;
}): RecurringStreamInsert {
  const { memberId, kind, stream } = input;
  return {
    memberId,
    kind,
    name: stream.merchant_name ?? stream.description,
    averageAmountCents: Math.round(Math.abs(stream.average_amount.amount ?? 0) * 100),
    frequency: mapRecurringFrequency(stream.frequency),
    nextExpectedDate: stream.predicted_next_date ?? null,
    providerStreamId: stream.stream_id,
  };
}
