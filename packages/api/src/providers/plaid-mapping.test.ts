import { describe, expect, it } from "vitest";

import {
  mapPersonalFinanceCategory,
  mapRecurringFrequency,
  removedTransactionIds,
  toBankAccountValues,
  toRecurringStreamValues,
  toTransactionValues,
} from "./plaid-mapping";

describe("mapPersonalFinanceCategory", () => {
  it("maps groceries vs. other food and drink", () => {
    expect(
      mapPersonalFinanceCategory({
        primary: "FOOD_AND_DRINK",
        detailed: "FOOD_AND_DRINK_GROCERIES",
      }),
    ).toBe("groceries");
    expect(
      mapPersonalFinanceCategory({
        primary: "FOOD_AND_DRINK",
        detailed: "FOOD_AND_DRINK_RESTAURANT",
      }),
    ).toBe("dining");
  });

  it("splits rent, phone, and other utilities", () => {
    expect(
      mapPersonalFinanceCategory({
        primary: "RENT_AND_UTILITIES",
        detailed: "RENT_AND_UTILITIES_RENT",
      }),
    ).toBe("housing");
    expect(
      mapPersonalFinanceCategory({
        primary: "RENT_AND_UTILITIES",
        detailed: "RENT_AND_UTILITIES_TELEPHONE",
      }),
    ).toBe("phone");
    expect(
      mapPersonalFinanceCategory({
        primary: "RENT_AND_UTILITIES",
        detailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
      }),
    ).toBe("utilities");
  });

  it("falls back to other for missing or unmapped categories", () => {
    expect(mapPersonalFinanceCategory(null)).toBe("other");
    expect(mapPersonalFinanceCategory({ primary: "ENTERTAINMENT", detailed: "x" })).toBe("other");
  });
});

describe("toTransactionValues", () => {
  it("carries Plaid's positive-is-out sign convention as-is", () => {
    const values = toTransactionValues({
      memberId: "member_1",
      bankAccountId: "account_1",
      txn: {
        transaction_id: "txn_1",
        date: "2026-09-15",
        amount: 42.5,
        merchant_name: "Corner Pharmacy",
        name: "CORNER PHARMACY #4",
        pending: false,
        personal_finance_category: {
          primary: "MEDICAL",
          detailed: "MEDICAL_PHARMACIES_AND_SUPPLEMENTS",
        },
      } as never,
    });
    expect(values.amountCents).toBe(4250);
    expect(values.merchantName).toBe("Corner Pharmacy");
    expect(values.category).toBe("pharmacy");
    expect(values.source).toBe("bank");
  });

  it("falls back to the raw name when merchant_name is missing", () => {
    const values = toTransactionValues({
      memberId: "member_1",
      bankAccountId: "account_1",
      txn: {
        transaction_id: "txn_2",
        date: "2026-09-16",
        amount: -1842,
        merchant_name: null,
        name: "SSA TREAS 310",
        pending: false,
        personal_finance_category: { primary: "INCOME", detailed: "INCOME_RETIREMENT_PENSION" },
      } as never,
    });
    expect(values.merchantName).toBe("SSA TREAS 310");
    expect(values.amountCents).toBe(-184200);
    expect(values.category).toBe("income");
  });
});

describe("removedTransactionIds", () => {
  it("extracts transaction ids", () => {
    expect(
      removedTransactionIds([{ transaction_id: "a" }, { transaction_id: "b" }] as never),
    ).toEqual(["a", "b"]);
  });
});

describe("toBankAccountValues", () => {
  it("prefers subtype for the account type and available balance when present", () => {
    const values = toBankAccountValues({
      memberId: "member_1",
      bankConnectionId: "conn_1",
      account: {
        account_id: "acct_1",
        name: "Plaid Checking",
        type: "depository",
        subtype: "checking",
        mask: "0000",
        balances: { current: 1024.5, available: 980.25, iso_currency_code: "USD" },
      } as never,
    });
    expect(values.type).toBe("checking");
    expect(values.currentBalanceCents).toBe(102450);
    expect(values.availableBalanceCents).toBe(98025);
  });

  it("falls back to current balance when available is null", () => {
    const values = toBankAccountValues({
      memberId: "member_1",
      bankConnectionId: "conn_1",
      account: {
        account_id: "acct_2",
        name: "Plaid Savings",
        type: "depository",
        subtype: null,
        mask: null,
        balances: { current: 500, available: null, iso_currency_code: "USD" },
      } as never,
    });
    expect(values.type).toBe("depository");
    expect(values.availableBalanceCents).toBe(50000);
  });
});

describe("mapRecurringFrequency", () => {
  it("lowercases known Plaid frequencies", () => {
    expect(mapRecurringFrequency("SEMI_MONTHLY" as never)).toBe("semi_monthly");
    expect(mapRecurringFrequency("MONTHLY" as never)).toBe("monthly");
  });

  it("falls back to unknown for unrecognized values", () => {
    expect(mapRecurringFrequency("QUARTERLY" as never)).toBe("unknown");
  });
});

describe("toRecurringStreamValues", () => {
  it("takes the absolute value of the average amount and keeps the provider stream id", () => {
    const values = toRecurringStreamValues({
      memberId: "member_1",
      kind: "income",
      stream: {
        stream_id: "stream_1",
        description: "Social Security",
        merchant_name: null,
        average_amount: { amount: -1842, iso_currency_code: "USD" },
        frequency: "MONTHLY",
        predicted_next_date: "2026-10-03",
      } as never,
    });
    expect(values.averageAmountCents).toBe(184200);
    expect(values.name).toBe("Social Security");
    expect(values.providerStreamId).toBe("stream_1");
    expect(values.nextExpectedDate).toBe("2026-10-03");
  });
});
