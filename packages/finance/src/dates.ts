// Calendar dates are ISO "YYYY-MM-DD" strings so money math never depends on
// the server's timezone. Callers convert to the member's local date first.
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: IsoDate): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Expected YYYY-MM-DD date, got "${value}"`);
  }
}

export function addDays(date: IsoDate, days: number): IsoDate {
  assertIsoDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The calendar date it is right now for someone in `timezone` (IANA name).
export function todayInTimezone(timezone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

// Next date strictly after `from` that falls on `dayOfMonth`, clamped to the
// month's last day (a bill "on the 31st" lands on Sep 30).
export function nextDayOfMonth(from: IsoDate, dayOfMonth: number): IsoDate {
  assertIsoDate(from);
  const [y, m] = from.split("-").map(Number) as [number, number];
  for (let offset = 0; offset < 3; offset++) {
    const lastDay = new Date(Date.UTC(y, m - 1 + offset + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, m - 1 + offset, Math.min(dayOfMonth, lastDay)));
    const iso = d.toISOString().slice(0, 10);
    if (iso > from) return iso;
  }
  throw new Error("unreachable");
}

// ISO dates sort lexicographically, so plain string comparison is safe.
export function isOnOrBefore(a: IsoDate, b: IsoDate): boolean {
  return a <= b;
}
