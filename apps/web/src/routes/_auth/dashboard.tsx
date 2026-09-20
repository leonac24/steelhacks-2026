import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@steelhacks-2026/ui/components/card";
import { Progress } from "@steelhacks-2026/ui/components/progress";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
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
                  <Progress value={(c.totalCents / topSpend) * 100} />
                </div>
              );
            })}
            <Link to="/budget" className="text-sm text-primary hover:underline">
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
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                    <meta.icon className="size-4 text-muted-foreground" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{t.merchantName ?? "Unknown"}</p>
                    <p className="text-muted-foreground text-xs">{formatIsoDate(t.date)}</p>
                  </div>
                </div>
                <span className={t.amountCents < 0 ? "font-medium text-green-500" : "font-medium"}>
                  {formatSignedCents(t.amountCents)}
                </span>
              </div>
            );
          })}
          <Link to="/transactions" className="pt-2 text-sm text-primary hover:underline">
            View all transactions →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | undefined }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {value === undefined ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
