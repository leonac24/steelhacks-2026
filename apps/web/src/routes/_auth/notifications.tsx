import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";

import { FinancialWeatherPanel } from "@/components/financial-weather-panel";
import { NotificationsPanel } from "@/components/notifications-panel";
import { useActiveMember } from "@/hooks/use-active-member";

export const Route = createFileRoute("/_auth/notifications")({
  component: RouteComponent,
});

function RouteComponent() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();

  if (membersLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!activeMemberId) {
    return <div className="text-muted-foreground text-sm">No members linked yet.</div>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <FinancialWeatherPanel memberId={activeMemberId} />
      <NotificationsPanel memberId={activeMemberId} />
    </div>
  );
}
