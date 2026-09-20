// Month-to-date view of a budget: what's spent, what's left, and where the
// month ends at this pace. For the "will they blow it by Sunday?" question
// the alerts use, see budget-pace.ts.
import { assertIsoDate, type IsoDate } from "./dates";

export type MonthRange = { from: IsoDate; to: IsoDate; daysInMonth: number; dayOfMonth: number };

// The calendar month `today` falls in, plus how far through it we are.
export function monthRange(today: IsoDate): MonthRange {
  assertIsoDate(today);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(daysInMonth)}`,
    daysInMonth,
    dayOfMonth: d,
  };
}

// "over" means spending faster than the month is passing, but still inside the
// limit; "exceeded" means the limit is already gone.
export type BudgetPace = "under" | "on_track" | "over" | "exceeded";

export type BudgetStatus = {
  limitCents: number;
  spentCents: number;
  // Negative once the limit is passed.
  remainingCents: number;
  percentUsed: number;
  // What the month ends at if spending keeps this pace.
  projectedCents: number;
  pace: BudgetPace;
};

// Within this much of the expected pace still counts as on track.
const ON_TRACK_TOLERANCE = 0.1;

export function budgetStatus(
  limitCents: number,
  spentCents: number,
  month: MonthRange,
): BudgetStatus {
  if (!Number.isInteger(limitCents) || !Number.isInteger(spentCents)) {
    throw new Error("Budget amounts must be integer cents");
  }
  const remainingCents = limitCents - spentCents;
  const percentUsed =
    limitCents === 0 ? (spentCents > 0 ? 100 : 0) : (spentCents / limitCents) * 100;
  const elapsed = Math.min(month.dayOfMonth / month.daysInMonth, 1);
  const projectedCents = elapsed === 0 ? spentCents : Math.round(spentCents / elapsed);

  let pace: BudgetPace = "on_track";
  if (remainingCents < 0) pace = "exceeded";
  else if (limitCents > 0) {
    const expected = limitCents * elapsed;
    if (spentCents > expected * (1 + ON_TRACK_TOLERANCE)) pace = "over";
    else if (spentCents < expected * (1 - ON_TRACK_TOLERANCE)) pace = "under";
  }

  return {
    limitCents,
    spentCents,
    remainingCents,
    percentUsed: Math.round(percentUsed),
    projectedCents,
    pace,
  };
}
