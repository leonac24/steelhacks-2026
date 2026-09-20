import { Badge } from "@steelhacks-2026/ui/components/badge";
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldAlert, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { categoryMeta } from "@/lib/categories";
import { formatCents, formatIsoDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";

// Shown on the dashboard (compact, capped, with a "See more" link) and on
// the dedicated /notifications page (compact=false, everything, no cap).
const COMPACT_LIMIT = 5;

export function NotificationsPanel({
  memberId,
  compact = false,
}: {
  memberId: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();

  const budgetWarnings = useQuery(
    orpc.caretaker.notifications.budgetWarnings.queryOptions({ input: { memberId } }),
  );
  const fraudAlerts = useQuery(
    orpc.caretaker.notifications.fraudAlerts.queryOptions({ input: { memberId } }),
  );

  const runFraudCheck = useMutation(
    orpc.caretaker.notifications.runFraudCheck.mutationOptions({
      onSuccess: (result) => {
        void queryClient.invalidateQueries({
          queryKey: orpc.caretaker.notifications.fraudAlerts.queryKey({ input: { memberId } }),
        });
        if (result.newAlerts === 0) {
          toast.success(`Checked ${result.checked} recent transactions — nothing suspicious.`);
        } else {
          toast.success(
            `Found ${result.newAlerts} new possible fraud alert${result.newAlerts === 1 ? "" : "s"}.` +
              (result.emailed ? " Emailed the caretaker." : " (Email not configured.)"),
          );
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const runBudgetCheck = useMutation(
    orpc.caretaker.notifications.runBudgetCheck.mutationOptions({
      onSuccess: (result) => {
        if (result.newAlerts === 0) {
          toast.success("No new budget alerts this week.");
        } else {
          toast.success(
            `Sent ${result.newAlerts} new budget alert${result.newAlerts === 1 ? "" : "s"}.` +
              (result.emailed ? " Emailed the caretaker." : " (Email not configured.)"),
          );
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isLoading = budgetWarnings.isLoading || fraudAlerts.isLoading;
  const budgetItems = budgetWarnings.data ?? [];
  const fraudItems = fraudAlerts.data ?? [];
  const totalCount = budgetItems.length + fraudItems.length;

  // Budget warnings first (usually few, actionable), then fraud alerts,
  // newest first; capped in compact mode so the dashboard card doesn't turn
  // into a wall of near-duplicate "Large charge" entries from demo testing.
  const shownBudgetItems = compact ? budgetItems.slice(0, COMPACT_LIMIT) : budgetItems;
  const remainingSlots = Math.max(0, COMPACT_LIMIT - shownBudgetItems.length);
  const shownFraudItems = compact ? fraudItems.slice(0, remainingSlots) : fraudItems;
  const hiddenCount = compact
    ? budgetItems.length - shownBudgetItems.length + (fraudItems.length - shownFraudItems.length)
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          Notifications{totalCount > 0 && <Badge className="ml-2">{totalCount}</Badge>}
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runBudgetCheck.mutate({ memberId })}
            disabled={runBudgetCheck.isPending}
          >
            {runBudgetCheck.isPending ? "Checking..." : "Check budgets"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runFraudCheck.mutate({ memberId })}
            disabled={runFraudCheck.isPending}
          >
            {runFraudCheck.isPending ? "Checking..." : "Check for fraud"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {isLoading && <Skeleton className="h-16 w-full" />}

        {!isLoading && totalCount === 0 && (
          <p className="text-muted-foreground text-sm">No alerts right now.</p>
        )}

        {shownBudgetItems.map((w) => {
          const meta = categoryMeta(w.category);
          return (
            <div key={w.category} className="flex items-start gap-3 py-3">
              <TrendingUp className="mt-0.5 size-4 shrink-0 text-sky-500" />
              <p className="text-sm">
                <span className="font-medium">{meta.label} budget: </span>
                {w.alreadyExceeded ? (
                  <>
                    already over ({formatCents(w.spentCents)} of {formatCents(w.limitCents)}).
                  </>
                ) : (
                  <>
                    on pace to hit {formatCents(w.projectedCents)} (limit{" "}
                    {formatCents(w.limitCents)}) by {formatIsoDate(w.endOfWeek)}.
                  </>
                )}
              </p>
            </div>
          );
        })}

        {shownFraudItems.map((a) => {
          const severity = a.metadata.severity === "warning" ? "warning" : "danger";
          return (
            <div key={a.id} className="flex items-start gap-3 py-3">
              {severity === "warning" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              ) : (
                <ShieldAlert className="text-destructive mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="text-sm">{a.summaryText}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(a.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}

        {compact && hiddenCount > 0 && (
          <div className="pt-3">
            <Link
              to="/notifications"
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              See {hiddenCount} more
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
