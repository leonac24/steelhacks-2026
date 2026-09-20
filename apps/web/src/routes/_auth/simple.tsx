// The senior interface. Same data as the caretaker dashboard, stripped to what
// a member actually needs: how much is safe to spend, what's due, and one
// button to call Robin.
//
// Accessibility rules for this file: body text never below 20px, touch targets
// at least 64px tall, real contrast, no information carried by colour alone,
// and no gesture-only interactions.
//
// TODO(post-hackathon): when the member signs in as themselves, read from
// member.summary instead — it needs no memberId and enforces requireSelfMember.
// Today this reads through the caretaker procedures so the demo can toggle.
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useActiveMember } from "@/hooks/use-active-member";
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from "@/lib/config";
import { daysUntilLabel, formatCents, formatCentsWhole, formatIsoDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/simple")({
  component: SimpleRoute,
});

function SimpleRoute() {
  const { activeMemberId, isLoading } = useActiveMember();

  if (isLoading || !activeMemberId) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return <SimpleView memberId={activeMemberId} />;
}

function SimpleView({ memberId }: { memberId: string }) {
  const summary = useQuery({
    ...orpc.caretaker.members.summary.queryOptions({ input: { memberId } }),
    refetchInterval: 5000,
  });

  if (!summary.data) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  const s = summary.data;
  const unfunded = s.upcomingBills.filter((b) => !b.covered);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 p-6 text-xl">
      {/* The one number that matters. */}
      <section
        className="border-2 border-foreground/20 p-8 text-center"
        aria-labelledby="safe-heading"
      >
        <h2 id="safe-heading" className="text-2xl">
          Hello {s.preferredName}, you can safely spend
        </h2>
        <p className="py-4 text-7xl font-bold tabular-nums" aria-live="polite">
          {formatCentsWhole(s.safeToSpendCents)}
        </p>
        <p className="text-xl text-muted-foreground">between now and your next deposit</p>
      </section>

      {/* Primary action. Big enough to hit without aiming. */}
      <a
        href={`tel:${SUPPORT_PHONE}`}
        className="flex min-h-20 w-full items-center justify-center bg-primary px-6 text-center text-3xl font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        Call Robin
      </a>
      <p className="-mt-4 text-center text-lg text-muted-foreground">
        or dial {SUPPORT_PHONE_DISPLAY} from any phone
      </p>

      {unfunded.length > 0 && (
        <section className="border-2 border-destructive p-6" aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="text-2xl font-semibold text-destructive">
            Needs attention
          </h2>
          <ul className="mt-3 space-y-2">
            {unfunded.map((bill) => (
              <li key={`${bill.name}-${bill.dueDate}`}>
                {bill.name} — {formatCents(bill.amountCents)} due{" "}
                {daysUntilLabel(bill.dueDate, s.today)}, and there may not be enough to cover it.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="bills-heading">
        <h2 id="bills-heading" className="mb-3 text-2xl font-semibold">
          Bills coming up
        </h2>
        {s.upcomingBills.length === 0 ? (
          <p className="text-muted-foreground">Nothing due in the next month.</p>
        ) : (
          <ul className="divide-y-2 divide-foreground/10 border-y-2 border-foreground/10">
            {s.upcomingBills.map((bill) => (
              <li
                key={`${bill.name}-${bill.dueDate}`}
                className="flex min-h-16 items-center justify-between gap-4 py-4"
              >
                <div>
                  <p>{bill.name}</p>
                  <p className="text-lg text-muted-foreground">{formatIsoDate(bill.dueDate)}</p>
                </div>
                <p className="font-semibold tabular-nums">{formatCents(bill.amountCents)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.nextIncome && (
        <section className="border-2 border-foreground/20 p-6" aria-labelledby="income-heading">
          <h2 id="income-heading" className="text-2xl font-semibold">
            Money coming in
          </h2>
          <p className="mt-2">
            {s.nextIncome.name} — {formatCents(s.nextIncome.amountCents)}{" "}
            {daysUntilLabel(s.nextIncome.date, s.today)} on {formatIsoDate(s.nextIncome.date)}.
          </p>
        </section>
      )}

      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="mb-3 text-2xl font-semibold">
          Recent calls from Robin
        </h2>
        {s.recentAlerts.length === 0 ? (
          <p className="text-muted-foreground">Robin hasn't needed to call you.</p>
        ) : (
          <ul className="space-y-3">
            {s.recentAlerts.map((alert, i) => (
              <li key={i} className="border-l-4 border-foreground/20 pl-4">
                {alert.summaryText}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="pt-4 text-center">
        <Link
          to="/dashboard"
          className="text-base text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Exit nester mode
        </Link>
      </div>
    </div>
  );
}
