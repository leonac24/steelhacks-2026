import { Skeleton } from "heroui-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { NotificationsPanel } from "@/components/notifications-panel";
import { useActiveMember } from "@/contexts/active-member-context";

// Mirror of apps/web/src/routes/_auth/notifications.tsx.
export default function NotificationsScreen() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();

  if (membersLoading) {
    return (
      <Container className="p-4">
        <Skeleton className="h-64 w-full rounded-lg" />
      </Container>
    );
  }
  if (!activeMemberId) {
    return (
      <Container className="p-4">
        <Text className="text-muted text-sm">No members linked yet.</Text>
      </Container>
    );
  }

  return (
    <Container className="p-4">
      <View className="gap-4 pb-6">
        <Text className="text-2xl font-semibold tracking-tight text-foreground">Notifications</Text>
        <NotificationsPanel memberId={activeMemberId} />
      </View>
    </Container>
  );
}
