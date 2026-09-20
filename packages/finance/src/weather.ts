// The Financial Weather Report: a short, ambient, spoken briefing — "Good
// morning. You're on track this month, groceries ran a little high, your
// Social Security deposit lands Thursday." Pure sentence building, no IO, so
// the voice agent reads one pre-formatted string and never improvises numbers.
import { addDays, assertIsoDate, type IsoDate } from "./dates";
import { budgetStatus, monthRange, type BudgetPace } from "./budget-progress";

export type BriefingFrequency = "daily" | "weekly";

// Every outbound briefing is one message: comma-separated sentences, exactly
// as June should read it.
export type WeatherBriefing = {
  sentences: string[];
  spoken: string;
};

export type WeatherBudget = {
  category: string;
  limitCents: number;
  spentCents: number;
};

export type WeatherIncome = {
  name: string;
  date: IsoDate;
  amountCents: number;
};

export type WeatherInput = {
  today: IsoDate;
  budgets: WeatherBudget[];
  // The next deposit we know about, if any.
  nextIncome: WeatherIncome | null;
  // First day the balance is projected to go below zero, if ever.
  shortfallDate: IsoDate | null;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayName(date: IsoDate): string {
  assertIsoDate(date);
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

export function daysUntil(from: IsoDate, to: IsoDate): number {
  assertIsoDate(from);
  assertIsoDate(to);
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// Severity order for picking the one budget worth mentioning out loud.
const PACE_RANK: Record<BudgetPace, number> = { exceeded: 3, over: 2, on_track: 1, under: 0 };

// The first deposit relative day, in listening-friendly words.
function incomeSentence(income: WeatherIncome, today: IsoDate): string {
  const days = daysUntil(today, income.date);
  const when =
    days <= 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : days <= 6
          ? `on ${weekdayName(income.date)}`
          : `in ${days} days`;
  return `Your ${income.name} deposit lands ${when}.`;
}

// One line about how the month is going: the single worst budget out loud, or
// a reassuring take when nothing is over the pace. The aggregate can't outrun
// every one of its parts, so the worst budget is the whole story.
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function monthSentence(budgets: WeatherBudget[], today: IsoDate): string {
  if (budgets.length === 0) return "";

  const month = monthRange(today);
  const statuses = budgets.map((b) => ({
    category: b.category,
    ...budgetStatus(b.limitCents, b.spentCents, month),
  }));
  const worst = [...statuses].sort(
    (a, b) =>
      PACE_RANK[b.pace] - PACE_RANK[a.pace] ||
      b.spentCents - b.limitCents - (a.spentCents - a.limitCents),
  )[0]!;

  const category = capitalize(worst.category);
  if (worst.pace === "exceeded") return `${category} ran over its budget this month.`;
  if (worst.pace === "over") return `${category} ran a little high this month.`;
  return "You're on track this month.";
}

export function buildFinancialWeather(input: WeatherInput): WeatherBriefing {
  assertIsoDate(input.today);

  const sentences: string[] = ["Good morning."];
  const month = monthSentence(input.budgets, input.today);
  if (month) sentences.push(month);

  if (input.nextIncome) sentences.push(incomeSentence(input.nextIncome, input.today));

  if (input.shortfallDate && daysUntil(input.today, input.shortfallDate) >= 0) {
    sentences.push("Heads up: your money may run short before your next deposit.");
  }

  return { sentences, spoken: sentences.join(" ") };
}

export function briefingInterval(frequency: BriefingFrequency): number {
  return frequency === "daily" ? 1 : 7;
}

// Whether the member is owed a briefing on `today`. A null lastBriefingDate
// counts as never sent. "Weekly" is lazy: exactly 7 days since the last one,
// so a missed cron catches up instead of drifting to a weekday.
export function isBriefingDue(
  lastBriefingDate: IsoDate | null,
  frequency: BriefingFrequency,
  today: IsoDate,
): boolean {
  if (!lastBriefingDate) return true;
  return daysUntil(lastBriefingDate, today) >= briefingInterval(frequency);
}

// The day the next briefing is due, from the caretaker's point of view.
export function nextBriefingDate(
  lastBriefingDate: IsoDate | null,
  frequency: BriefingFrequency,
  today: IsoDate,
): IsoDate | null {
  if (!lastBriefingDate) return today;
  const dueToday = isBriefingDue(lastBriefingDate, frequency, today);
  if (dueToday) return today;
  return addDays(today, briefingInterval(frequency) - daysUntil(lastBriefingDate, today));
}
