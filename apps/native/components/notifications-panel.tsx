import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Chip, Skeleton, useThemeColor, useToast } from "heroui-native";
import { Text, View } from "react-native";

import { categoryMeta } from "@/lib/categories";
import { formatCents, formatIsoDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";

// Mirror of apps/web/src/components/notifications-panel.tsx.
export function NotificationsPanel({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const warningColor = useThemeColor("warning");
  const dangerColor = useThemeColor("danger");

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
        toast.show({
          variant: "success",
          label:
            result.newAlerts === 0
              ? `Checked ${result.checked} recent transactions, nothing suspicious.`
              : `Found ${result.newAlerts} new possible fraud alert${result.newAlerts === 1 ? "" : "s"}.` +
                (result.emailed ? " Emailed the caretaker." : " (Email not configured.)"),
        });
      },
      onError: (error) => toast.show({ variant: "danger", label: error.message }),
    }),
  );

  const runBudgetCheck = useMutation(
    orpc.caretaker.notifications.runBudgetCheck.mutationOptions({
      onSuccess: (result) => {
        toast.show({
          variant: "success",
          label:
            result.newAlerts === 0
              ? "No new budget alerts this week."
              : `Sent ${result.newAlerts} new budget alert${result.newAlerts === 1 ? "" : "s"}.` +
                (result.emailed ? " Emailed the caretaker." : " (Email not configured.)"),
        });
      },
      onError: (error) => toast.show({ variant: "danger", label: error.message }),
    }),
  );

  const isLoading = budgetWarnings.isLoading || fraudAlerts.isLoading;
  const totalCount = (budgetWarnings.data?.length ?? 0) + (fraudAlerts.data?.length ?? 0);

  return (
    <Card variant="secondary" className="p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Card.Title>Notifications</Card.Title>
          {totalCount > 0 && (
            <Chip variant="secondary" color="accent" size="sm">
              <Chip.Label>{totalCount}</Chip.Label>
            </Chip>
          )}
        </View>
      </View>
      <View className="mb-3 flex-row gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={() => runBudgetCheck.mutate({ memberId })}
          isDisabled={runBudgetCheck.isPending}
        >
          <Button.Label>{runBudgetCheck.isPending ? "Checking..." : "Check budgets"}</Button.Label>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => runFraudCheck.mutate({ memberId })}
          isDisabled={runFraudCheck.isPending}
        >
          <Button.Label>{runFraudCheck.isPending ? "Checking..." : "Check for fraud"}</Button.Label>
        </Button>
      </View>

      <View className="gap-3">
        {isLoading && <Skeleton className="h-16 w-full rounded-lg" />}

        {!isLoading && totalCount === 0 && (
          <Text className="text-muted text-sm">No alerts right now.</Text>
        )}

        {budgetWarnings.data?.map((w) => {
          const meta = categoryMeta(w.category);
          return (
            <View key={w.category} className="flex-row items-start gap-3">
              <Ionicons
                name="trending-up"
                size={16}
                color={warningColor}
                style={{ marginTop: 2 }}
              />
              <Text className="flex-1 text-sm text-foreground">
                <Text className="font-medium">{meta.label} budget: </Text>
                {w.alreadyExceeded
                  ? `already over (${formatCents(w.spentCents)} of ${formatCents(w.limitCents)}).`
                  : `on pace to hit ${formatCents(w.projectedCents)} (limit ${formatCents(w.limitCents)}) by ${formatIsoDate(w.endOfWeek)}.`}
              </Text>
            </View>
          );
        })}

        {fraudAlerts.data?.map((a) => (
          <View key={a.id} className="flex-row items-start gap-3">
            <Ionicons
              name="shield-half-outline"
              size={16}
              color={dangerColor}
              style={{ marginTop: 2 }}
            />
            <View className="flex-1">
              <Text className="text-sm text-foreground">{a.summaryText}</Text>
              <Text className="text-muted text-xs">{new Date(a.createdAt).toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}
