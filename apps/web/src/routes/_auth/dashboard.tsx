import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@steelhacks-2026/ui/components/card";
import {
  ProgressIndicator,
  ProgressPrimitive,
  ProgressTrack,
} from "@steelhacks-2026/ui/components/progress";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BalanceChart } from "@/components/charts/balance-chart";
import { NotificationsPanel } from "@/components/notifications-panel";
import { useActiveMember } from "@/hooks/use-active-member";
import { categoryMeta } from "@/lib/categories";
import { formatCents, formatIsoDate, formatSignedCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { activeMember, activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;

  const summary = useQuery(
    orpc.caretaker.members.summary.queryOptions({
      input: { memberId: activeMemberId! },
      enabled,
    }),
  );
  const balanceHistory = useQuery(
    orpc.caretaker.insights.balanceHistory.queryOptions({
      input: { memberId: activeMemberId!, days: 30 },
      enabled,
    }),
  );
  const breakdown = useQuery(
    orpc.caretaker.insights.categoryBreakdown.queryOptions({
      input: { memberId: activeMemberId!, days: 30 },
      enabled,
    }),
  );
  const recentTxns = useQuery(
    orpc.caretaker.transactions.list.queryOptions({
      input: { memberId: activeMemberId!, limit: 5 },
      enabled,
    }),
  );

  if (membersLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!enabled) {
    return <div className="text-muted-foreground text-sm">No members linked yet.</div>;
  }

  const topCategories = breakdown.data?.slice(0, 4) ?? [];
  const topSpend = topCategories.reduce((sum, c) => sum + c.totalCents, 0) || 1;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome back{activeMember ? `, ${activeMember.preferredName}'s dashboard` : ""}
      </h1>

      <NotificationsPanel memberId={activeMemberId!} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Safe to spend today"
          value={summary.data ? formatCents(summary.data.safeToSpendCents) : undefined}
          hero
        />
        <StatCard
          label="Available balance"
          value={summary.data ? formatCents(summary.data.availableBalanceCents) : undefined}
        />
        <StatCard
          label="Next income"
          value={
            summary.data
              ? summary.data.nextIncome
                ? `${formatCents(summary.data.nextIncome.amountCents)} on ${formatIsoDate(summary.data.nextIncome.date)}`
                : "None expected"
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Balance</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {balanceHistory.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <BalanceChart data={balanceHistory.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top spending</CardTitle>
            <CardDescription>By category, last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {breakdown.isLoading && <Skeleton className="h-40 w-full" />}
            {!breakdown.isLoading && topCategories.length === 0 && (
              <p className="text-muted-foreground text-sm">No spending yet.</p>
            )}
            {topCategories.map((c) => {
              const meta = categoryMeta(c.category);
              return (
                <div key={c.category} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <meta.icon className="size-4 text-muted-foreground" />
                      {meta.label}
                    </span>
                    <span className="text-muted-foreground">{formatCents(c.totalCents)}</span>
                  </div>
                  <ProgressPrimitive.Root value={(c.totalCents / topSpend) * 100}>
                    <ProgressTrack>
                      <ProgressIndicator className="bg-gradient-to-r from-teal-400 to-teal-600" />
                    </ProgressTrack>
                  </ProgressPrimitive.Root>
                </div>
              );
            })}
            <Link
              to="/budget"
              className="bg-gradient-to-r from-teal-600 to-teal-500 bg-clip-text text-sm font-medium text-transparent hover:underline"
            >
              View budget →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {recentTxns.isLoading && <Skeleton className="h-32 w-full" />}
          {!recentTxns.isLoading && recentTxns.data?.items.length === 0 && (
            <p className="text-muted-foreground text-sm">No transactions yet.</p>
          )}
          {recentTxns.data?.items.map((t) => {
            const meta = categoryMeta(t.category);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-200">
                    <meta.icon className="size-4 text-teal-800" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{t.merchantName ?? "Unknown"}</p>
                    <p className="text-muted-foreground text-xs">{formatIsoDate(t.date)}</p>
                  </div>
                </div>
                <span className={t.amountCents < 0 ? "font-medium text-emerald-600" : "font-medium"}>
                  {formatSignedCents(t.amountCents)}
                </span>
              </div>
            );
          })}
          <Link
            to="/transactions"
            className="bg-gradient-to-r from-teal-600 to-teal-500 bg-clip-text pt-2 text-sm font-medium text-transparent hover:underline"
          >
            View all transactions →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  hero = false,
}: {
  label: string;
  value: string | undefined;
  hero?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        hero && "border-teal-200 bg-gradient-to-br from-teal-50 via-white to-white",
      )}
    >
      {hero && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-gradient-to-br from-teal-300/40 to-teal-500/0 blur-2xl"
        />
      )}
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {value === undefined ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p
            className={cn(
              "text-2xl font-semibold tracking-tight",
              hero &&
                "bg-gradient-to-br from-teal-600 via-teal-500 to-sky-500 bg-clip-text text-3xl text-transparent",
            )}
          >
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
