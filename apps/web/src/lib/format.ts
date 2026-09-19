// Display formatting for the caretaker and senior interfaces.
// Money math lives in @steelhacks-2026/finance; this is presentation only.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** 131742 -> "$1,317.42" */
export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/** 131742 -> "$1,317". Used where the cents are noise, e.g. the huge senior number. */
export function formatCentsWhole(cents: number): string {
  return USD_WHOLE.format(Math.round(cents / 100));
}

/** ISO date string ("2026-09-22") -> "Mon, Sep 22". Parsed as local, not UTC. */
export function formatIsoDate(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "in 3 days", "tomorrow", "today" — relative to the member's today. */
export function daysUntilLabel(iso: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "just now", "4m ago", "3h ago", "2d ago" — for the activity feed. */
export function timeAgo(value: Date | string, now: Date = new Date()): string {
  const then = value instanceof Date ? value : new Date(value);
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "23h left", "45m left", "expired" — the approval countdown. */
export function timeLeft(deadline: Date | string, now: Date = new Date()): string {
  const end = deadline instanceof Date ? deadline : new Date(deadline);
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

/** "groceries" -> "Groceries". Categories are stored lowercase. */
export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
