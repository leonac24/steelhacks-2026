// Caretaker dashboard: who you look after, their cash picture, anything
// waiting on your decision, and a live feed of what's happening.
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAppState } from "@/lib/app-state";
import { daysUntilLabel, formatCents, formatIsoDate, timeAgo, timeLeft } from "@/lib/format";
import { useActiveMember } from "@/lib/use-active-member";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardRoute,
});

// The demo hinges on the feed updating while nobody touches the page.
const POLL_MS = 3000;

function DashboardRoute() {
  const { members, member, memberId, isLoading } = useActiveMember();

  if (isLoading) return <DashboardSkeleton />;

  if (!member || !memberId) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No members yet</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            This account isn't linked to anyone. Run <code>pnpm db:seed</code> and sign in as{" "}
            <code>maria@demo.dev</code> to load the demo data.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <MemberSwitcher members={members} activeId={memberId} />
      <Approvals memberId={memberId} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <CashPicture memberId={memberId} />
          <Bills memberId={memberId} />
        </div>
        <ActivityFeed memberId={memberId} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- member

type MemberRow = { id: string; fullName: string; preferredName: string; role: string };

function MemberSwitcher({ members, activeId }: { members: MemberRow[]; activeId: string }) {
  const { setActiveMemberId } = useAppState();
  const active = members.find((m) => m.id === activeId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{active?.fullName}</h1>
        <p className="text-sm text-muted-foreground">You are the {active?.role} caretaker</p>
      </div>
      <div className="flex items-center gap-2">
        {members.length > 1 &&
          members.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={m.id === activeId ? "default" : "outline"}
              onClick={() => setActiveMemberId(m.id)}
            >
              {m.preferredName}
            </Button>
          ))}
        <Button variant="outline" size="sm" render={<Link to="/simple" />}>
          See {active?.preferredName}'s view
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- approvals

function Approvals({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const approvals = useQuery({
    ...orpc.caretaker.approvals.list.queryOptions({ input: { memberId } }),
    refetchInterval: POLL_MS,
  });

  const settle = (action: "approve" | "reject") => ({
    ...orpc.caretaker.approvals[action].mutationOptions(),
    onSuccess: () => {
      toast.success(action === "approve" ? "Approved" : "Declined");
      queryClient.invalidateQueries({ queryKey: orpc.caretaker.key() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approve = useMutation(settle("approve"));
  const reject = useMutation(settle("reject"));
  const pending = approvals.data ?? [];

  if (pending.length === 0) return null;

  return (
    <Card className="ring-2 ring-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Waiting on you ({pending.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.map((request) => (
          <div
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-3 border border-foreground/10 p-3"
          >
            <div>
              <p className="text-sm font-medium">{request.summaryText}</p>
              <p className="text-xs text-muted-foreground">
                Asked for by phone {timeAgo(request.createdAt)} ·{" "}
                {request.approvalDeadline
                  ? `${timeLeft(request.approvalDeadline)} to decide`
                  : "no deadline"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={approve.isPending || reject.isPending}
                onClick={() => approve.mutate({ memberId, changeRequestId: request.id })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={approve.isPending || reject.isPending}
                onClick={() => reject.mutate({ memberId, changeRequestId: request.id })}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- summary

function CashPicture({ memberId }: { memberId: string }) {
  const summary = useQuery({
    ...orpc.caretaker.members.summary.queryOptions({ input: { memberId } }),
    refetchInterval: POLL_MS,
  });

  if (!summary.data) return <Skeleton className="h-48 w-full" />;
  const s = summary.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Safe to spend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-4xl font-semibold tabular-nums">{formatCents(s.safeToSpendCents)}</p>
          <p className="text-xs text-muted-foreground">
            after upcoming bills and a {formatCents(s.safetyBufferCents)} cushion
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-foreground/10 pt-4 text-sm">
          <Stat label="Available" value={formatCents(s.availableBalanceCents)} />
          <Stat label="Current balance" value={formatCents(s.currentBalanceCents)} />
          {s.nextIncome && (
            <Stat
              label={s.nextIncome.name}
              value={`${formatCents(s.nextIncome.amountCents)} ${daysUntilLabel(s.nextIncome.date, s.today)}`}
            />
          )}
          <Stat
            label="Shortfall risk"
            value={
              s.shortfall.willShortfall
                ? `${formatCents(s.shortfall.shortfallCents)} short`
                : "None projected"
            }
            tone={s.shortfall.willShortfall ? "warn" : "ok"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function Bills({ memberId }: { memberId: string }) {
  const summary = useQuery({
    ...orpc.caretaker.members.summary.queryOptions({ input: { memberId } }),
    refetchInterval: POLL_MS,
  });

  if (!summary.data) return <Skeleton className="h-40 w-full" />;
  const { upcomingBills, today } = summary.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next 30 days</CardTitle>
      </CardHeader>
      <CardContent>
        {upcomingBills.length === 0 ? (
          <p className="text-muted-foreground">No bills due in the next 30 days.</p>
        ) : (
          <ul className="divide-y divide-foreground/10">
            {upcomingBills.map((bill) => (
              <li
                key={`${bill.name}-${bill.dueDate}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div>
                  <p className="text-sm">{bill.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatIsoDate(bill.dueDate)} · {daysUntilLabel(bill.dueDate, today)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{formatCents(bill.amountCents)}</p>
                  <p
                    className={`text-xs ${bill.covered ? "text-muted-foreground" : "text-destructive"}`}
                  >
                    {bill.covered ? "covered" : "not covered"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- feed

function ActivityFeed({ memberId }: { memberId: string }) {
  const activity = useQuery({
    ...orpc.caretaker.activity.list.queryOptions({ input: { memberId, limit: 30 } }),
    refetchInterval: POLL_MS,
  });

  const items = activity.data?.items ?? [];

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Activity</span>
          <span className="text-xs font-normal text-muted-foreground">
            {activity.isFetching ? "updating…" : "live"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="border-l-2 border-foreground/15 pl-3">
                <p className="text-sm">{item.summaryText}</p>
                <p className="text-xs text-muted-foreground">
                  {timeAgo(item.createdAt)} · {item.type.replace(/_/g, " ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
