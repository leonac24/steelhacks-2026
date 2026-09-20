import { addDays, assertIsoDate, type IsoDate } from "./dates";

export type BudgetPaceInput = {
  spentCents: number;
  limitCents: number;
  // First day of the month spend is measured over.
  monthStart: IsoDate;
  today: IsoDate;
};

export type BudgetPaceResult = {
  // Spend projected by end of week if the current daily pace holds.
  projectedCents: number;
  alreadyExceeded: boolean;
  onPaceToExceedByEndOfWeek: boolean;
  endOfWeek: IsoDate;
};

function toUtcMillis(date: IsoDate): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / 86_400_000);
}

// The coming Sunday, inclusive of today (today counts as day 0 of the week).
function endOfWeek(today: IsoDate): IsoDate {
  const dayOfWeek = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, (7 - dayOfWeek) % 7);
}

// Projects whether a budget will blow past its monthly limit by the end of
// this week, extrapolating from the average daily spend so far this month.
export function projectBudgetPace(input: BudgetPaceInput): BudgetPaceResult {
  assertIsoDate(input.monthStart);
  assertIsoDate(input.today);

  const daysElapsed = Math.max(daysBetween(input.monthStart, input.today) + 1, 1);
  const dailyRateCents = input.spentCents / daysElapsed;
  const endOfWeekDate = endOfWeek(input.today);
  const daysUntilEndOfWeek = daysBetween(input.today, endOfWeekDate);
  const projectedCents = Math.round(input.spentCents + dailyRateCents * daysUntilEndOfWeek);

  return {
    projectedCents,
    alreadyExceeded: input.spentCents > input.limitCents,
    onPaceToExceedByEndOfWeek: projectedCents > input.limitCents,
    endOfWeek: endOfWeekDate,
  };
}
