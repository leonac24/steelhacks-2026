const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const currencyWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

// No decimals — for large, prominent numbers like "safe to spend today".
export function formatCentsWhole(cents: number): string {
  return currencyWhole.format(cents / 100);
}

export function formatSignedCents(cents: number): string {
  const formatted = formatCents(Math.abs(cents));
  return cents < 0 ? `+${formatted}` : `-${formatted}`;
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

// `date` is an ISO "YYYY-MM-DD" string; parse as UTC so it doesn't shift a
// day depending on the device's timezone.
export function formatIsoDate(date: string, style: "short" | "long" = "short"): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return (style === "short" ? shortDate : longDate).format(parsed);
}

const relativeTime = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const RELATIVE_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
  { amount: 4.34524, unit: "weeks" },
  { amount: 12, unit: "months" },
  { amount: Number.POSITIVE_INFINITY, unit: "years" },
];

function formatRelative(date: string | Date): string {
  const target = typeof date === "string" ? new Date(date) : date;
  let duration = (target.getTime() - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeTime.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return relativeTime.format(Math.round(duration), "years");
}

// "2 hours ago" style. `date` is a full ISO timestamp.
export function timeAgo(date: string | Date): string {
  return formatRelative(date);
}

// "in 3 hours" style, or "expired" once the deadline has passed.
export function timeLeft(date: string | Date): string {
  const target = typeof date === "string" ? new Date(date) : date;
  if (target.getTime() <= Date.now()) return "expired";
  return formatRelative(date);
}

// "today" / "tomorrow" / "in 3 days" style. Both are ISO "YYYY-MM-DD"
// strings — `today` is passed in (rather than read from the clock) so the
// caller's server-computed "today" stays the source of truth.
export function daysUntilLabel(date: string, today: string): string {
  const target = new Date(`${date}T00:00:00Z`);
  const from = new Date(`${today}T00:00:00Z`);
  const days = Math.round((target.getTime() - from.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}
