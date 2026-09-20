// Everything Robin proposed by phone that needs a caretaker decision.
// The dashboard pins these too; this page is the full queue.
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { useActiveMember } from "@/hooks/use-active-member";
import { timeAgo, timeLeft } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/approvals")({
  component: ApprovalsRoute,
});

function ApprovalsRoute() {
  const { activeMember, activeMemberId, isLoading } = useActiveMember();

  if (isLoading) return <Skeleton className="m-6 h-40 w-full max-w-3xl" />;
  if (!activeMemberId) {
    return <p className="p-6 text-muted-foreground">No members linked to this account.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Changes {activeMember?.preferredName} asked for that need your decision.
        </p>
      </div>
      <Queue memberId={activeMemberId} />
    </div>
  );
}

function Queue({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const approvals = useQuery({
    ...orpc.caretaker.approvals.list.queryOptions({ input: { memberId } }),
    refetchInterval: 3000,
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
  const busy = approve.isPending || reject.isPending;

  if (approvals.isLoading) return <Skeleton className="h-40 w-full" />;
  const pending = approvals.data ?? [];

  if (pending.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Nothing waiting on you.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {pending.map((request) => (
        <Card key={request.id}>
          <CardHeader>
            <CardTitle className="text-base">{request.summaryText}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Requested</dt>
                <dd>{timeAgo(request.createdAt)} by phone</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Decide by</dt>
                <dd>
                  {request.approvalDeadline
                    ? timeLeft(request.approvalDeadline)
                    : "no deadline set"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Change type</dt>
                <dd className="font-mono">{request.changeType}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              If you don't decide in time this expires and nothing changes.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={busy}
                onClick={() => approve.mutate({ memberId, changeRequestId: request.id })}
              >
                Approve
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => reject.mutate({ memberId, changeRequestId: request.id })}
              >
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
