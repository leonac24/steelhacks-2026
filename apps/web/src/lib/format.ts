const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return currency.format(cents / 100);
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
// day depending on the browser's timezone.
export function formatIsoDate(date: string, style: "short" | "long" = "short"): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return (style === "short" ? shortDate : longDate).format(parsed);
}
