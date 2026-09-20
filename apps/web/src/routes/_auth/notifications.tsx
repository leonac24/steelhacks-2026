import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { NotificationsPanel } from "@/components/notifications-panel";
import { useActiveMember } from "@/hooks/use-active-member";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/notifications")({
  component: RouteComponent,
});

function RouteComponent() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();
  const queryClient = useQueryClient();
  const markAllRead = useMutation(orpc.caretaker.notifications.markAllRead.mutationOptions());
  // Guards against React 18 double-invoking effects in dev, which would
  // otherwise fire the mutation twice for one page visit.
  const markedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!activeMemberId || markedFor.current === activeMemberId) return;
    markedFor.current = activeMemberId;
    markAllRead.mutate(
      { memberId: activeMemberId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: orpc.caretaker.notifications.unreadCount.queryKey({
              input: { memberId: activeMemberId },
            }),
          });
          void queryClient.invalidateQueries({
            queryKey: orpc.caretaker.notifications.fraudAlerts.queryKey({
              input: { memberId: activeMemberId },
            }),
          });
        },
      },
    );
    // Only re-run when the selected member changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMemberId]);

  if (membersLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!activeMemberId) {
    return <div className="text-muted-foreground text-sm">No members linked yet.</div>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <NotificationsPanel memberId={activeMemberId} />
    </div>
  );
}
