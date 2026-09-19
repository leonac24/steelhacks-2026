import { addDays, assertIsoDate, isOnOrBefore, type IsoDate } from "./dates";

export type UpcomingBill = {
  name: string;
  amountCents: number;
  dueDate: IsoDate;
};

export type CashFlowInput = {
  availableBalanceCents: number;
  upcomingBills: UpcomingBill[];
  // null when we don't know of any upcoming income.
  nextIncomeDate: IsoDate | null;
  today: IsoDate;
  bufferCents: number;
};

// Without a known payday we look this far ahead for bills.
export const DEFAULT_HORIZON_DAYS = 30;

function assertCents(label: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be integer cents, got ${value}`);
  }
}

function validate(input: CashFlowInput): void {
  assertCents("availableBalanceCents", input.availableBalanceCents);
  assertCents("bufferCents", input.bufferCents);
  assertIsoDate(input.today);
  if (input.nextIncomeDate) assertIsoDate(input.nextIncomeDate);
  for (const bill of input.upcomingBills) {
    assertCents(`bill "${bill.name}"`, bill.amountCents);
    assertIsoDate(bill.dueDate);
  }
}

// Bills due from today through the next income date, inclusive. A bill due on
// payday counts because the deposit may land after the bill is drawn.
export function billsBeforeIncome(input: CashFlowInput): UpcomingBill[] {
  validate(input);
  const horizon = input.nextIncomeDate ?? addDays(input.today, DEFAULT_HORIZON_DAYS);
  return input.upcomingBills
    .filter((b) => isOnOrBefore(input.today, b.dueDate) && isOnOrBefore(b.dueDate, horizon))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function sumCents(bills: UpcomingBill[]): number {
  return bills.reduce((total, b) => total + b.amountCents, 0);
}

// Money left after upcoming bills and the safety buffer. Can be negative.
function rawSafeToSpend(input: CashFlowInput): number {
  const reserved = sumCents(billsBeforeIncome(input));
  return input.availableBalanceCents - reserved - input.bufferCents;
}

// How much can be spent before the next income without missing a bill or
// dipping into the safety buffer. Never below zero.
export function safeToSpend(input: CashFlowInput): number {
  return Math.max(0, rawSafeToSpend(input));
}

export type ShortfallProjection = {
  willShortfall: boolean;
  // How much more money is needed to cover every bill before next income.
  shortfallCents: number;
  // First date the balance goes below zero.
  date: IsoDate | null;
};

// Walks bills in due-date order and reports when the balance first goes
// negative. The safety buffer is ignored: this predicts a real overdraft.
export function projectShortfall(input: CashFlowInput): ShortfallProjection {
  let balance = input.availableBalanceCents;
  let date: IsoDate | null = null;
  for (const bill of billsBeforeIncome(input)) {
    balance -= bill.amountCents;
    if (balance < 0 && date === null) date = bill.dueDate;
  }
  return {
    willShortfall: date !== null,
    shortfallCents: balance < 0 ? -balance : 0,
    date,
  };
}

export type AffordAnswer = "yes" | "yes_but_tight" | "no";

export type AffordResult = {
  answer: AffordAnswer;
  // Money left after this purchase and the bills due before next income.
  // Negative when the purchase would leave a bill unpaid.
  remainingAfter: number;
  nextIncomeDate: IsoDate | null;
};

// "yes" leaves the safety buffer intact, "yes_but_tight" dips into it,
// "no" means a bill before next income would go unpaid.
export function canAfford(amountCents: number, input: CashFlowInput): AffordResult {
  assertCents("amountCents", amountCents);
  if (amountCents < 0) throw new Error("amountCents must not be negative");

  const remainingAfter = rawSafeToSpend(input) + input.bufferCents - amountCents;
  let answer: AffordAnswer = "yes";
  if (remainingAfter < 0) answer = "no";
  else if (remainingAfter < input.bufferCents) answer = "yes_but_tight";

  return { answer, remainingAfter, nextIncomeDate: input.nextIncomeDate };
}
