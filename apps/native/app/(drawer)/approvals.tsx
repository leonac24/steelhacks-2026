import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Skeleton, useToast } from "heroui-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { useActiveMember } from "@/contexts/active-member-context";
import { timeAgo, timeLeft } from "@/lib/format";
import { orpc } from "@/utils/orpc";

// Mirror of apps/web/src/routes/_auth/approvals.tsx: everything the member
// proposed by phone that needs a caretaker decision.
export default function ApprovalsScreen() {
  const { activeMember, activeMemberId, isLoading } = useActiveMember();

  if (isLoading) {
    return (
      <Container className="p-4">
        <Skeleton className="h-40 w-full rounded-lg" />
      </Container>
    );
  }
  if (!activeMemberId) {
    return (
      <Container className="p-4">
        <Text className="text-muted text-sm">No members linked to this account.</Text>
      </Container>
    );
  }

  return (
    <Container className="p-4">
      <View className="gap-4 pb-6">
        <View>
          <Text className="text-2xl font-semibold tracking-tight text-foreground">Approvals</Text>
          <Text className="text-muted text-sm">
            Changes {activeMember?.preferredName} asked for that need your decision.
          </Text>
        </View>
        <Queue memberId={activeMemberId} />
      </View>
    </Container>
  );
}

function Queue({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const approvals = useQuery({
    ...orpc.caretaker.approvals.list.queryOptions({ input: { memberId } }),
    refetchInterval: 3000,
  });

  const settle = (action: "approve" | "reject") => ({
    ...orpc.caretaker.approvals[action].mutationOptions(),
    onSuccess: () => {
      toast.show({ variant: "success", label: action === "approve" ? "Approved" : "Declined" });
      queryClient.invalidateQueries({ queryKey: orpc.caretaker.key() });
    },
    onError: (error: Error) => toast.show({ variant: "danger", label: error.message }),
  });

  const approve = useMutation(settle("approve"));
  const reject = useMutation(settle("reject"));
  const busy = approve.isPending || reject.isPending;

  if (approvals.isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  const pending = approvals.data ?? [];

  if (pending.length === 0) {
    return (
      <Card variant="secondary" className="items-center p-10">
        <Text className="text-muted text-sm">Nothing waiting on you.</Text>
      </Card>
    );
  }

  return (
    <View className="gap-4">
      {pending.map((request) => (
        <Card key={request.id} variant="secondary" className="p-4">
          <Card.Title className="mb-3 text-base">{request.summaryText}</Card.Title>
          <View className="mb-3 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">Requested</Text>
              <Text className="text-xs text-foreground">{timeAgo(request.createdAt)} by phone</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">Decide by</Text>
              <Text className="text-xs text-foreground">
                {request.approvalDeadline ? timeLeft(request.approvalDeadline) : "no deadline set"}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">Change type</Text>
              <Text className="font-mono text-xs text-foreground">{request.changeType}</Text>
            </View>
          </View>
          <Text className="text-muted mb-3 text-xs">
            If you don't decide in time this expires and nothing changes.
          </Text>
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              isDisabled={busy}
              onPress={() => approve.mutate({ memberId, changeRequestId: request.id })}
            >
              <Button.Label>Approve</Button.Label>
            </Button>
            <Button
              className="flex-1"
              variant="danger"
              isDisabled={busy}
              onPress={() => reject.mutate({ memberId, changeRequestId: request.id })}
            >
              <Button.Label>Decline</Button.Label>
            </Button>
          </View>
        </Card>
      ))}
    </View>
  );
}
