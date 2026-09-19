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

// ISO dates sort lexicographically, so plain string comparison is safe.
export function isOnOrBefore(a: IsoDate, b: IsoDate): boolean {
  return a <= b;
}
