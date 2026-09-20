import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Card, Skeleton, useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { BalanceChart } from "@/components/balance-chart";
import { Container } from "@/components/container";
import { NotificationsPanel } from "@/components/notifications-panel";
import { ProgressBar } from "@/components/progress-bar";
import { StatCard } from "@/components/stat-card";
import { useActiveMember } from "@/contexts/active-member-context";
import { categoryMeta } from "@/lib/categories";
import { formatCents, formatIsoDate, formatSignedCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

// Mirror of apps/web/src/routes/_auth/dashboard.tsx.
export default function DashboardScreen() {
  const { activeMember, activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;
  const mutedColor = useThemeColor("muted");
  const successColor = useThemeColor("success");
  const foregroundColor = useThemeColor("foreground");
  const accentColor = useThemeColor("accent");

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

  const topCategories = breakdown.data?.slice(0, 4) ?? [];
  const topSpend = topCategories.reduce((sum, c) => sum + c.totalCents, 0) || 1;

  return (
    <Container className="p-4">
      <View className="gap-4 pb-6">
        <Text className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome back{activeMember ? `, ${activeMember.preferredName}'s dashboard` : ""}
        </Text>

        <NotificationsPanel memberId={activeMemberId} />

        <StatCard
          label="Safe to spend today"
          hero
          value={summary.data ? formatCents(summary.data.safeToSpendCents) : undefined}
        />
        <View className="flex-row gap-4">
          <View className="flex-1">
            <StatCard
              label="Available balance"
              value={summary.data ? formatCents(summary.data.availableBalanceCents) : undefined}
            />
          </View>
          <View className="flex-1">
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
          </View>
        </View>

        <Card variant="secondary" className="p-4">
          <View className="mb-3">
            <Card.Title>Balance</Card.Title>
            <Card.Description>Last 30 days</Card.Description>
          </View>
          {balanceHistory.isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <BalanceChart data={balanceHistory.data ?? []} />
          )}
        </Card>

        <Card variant="secondary" className="p-4">
          <View className="mb-3">
            <Card.Title>Top spending</Card.Title>
            <Card.Description>By category, last 30 days</Card.Description>
          </View>
          <View className="gap-4">
            {breakdown.isLoading && <Skeleton className="h-40 w-full rounded-lg" />}
            {!breakdown.isLoading && topCategories.length === 0 && (
              <Text className="text-muted text-sm">No spending yet.</Text>
            )}
            {topCategories.map((c) => {
              const meta = categoryMeta(c.category);
              return (
                <View key={c.category} className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name={meta.icon} size={16} color={mutedColor} />
                      <Text className="text-sm font-medium text-foreground">{meta.label}</Text>
                    </View>
                    <Text className="text-muted text-sm">{formatCents(c.totalCents)}</Text>
                  </View>
                  <ProgressBar value={(c.totalCents / topSpend) * 100} />
                </View>
              );
            })}
            <Link href="/budget" asChild>
              <Pressable>
                <Text className="text-sm font-medium" style={{ color: accentColor }}>
                  View budget →
                </Text>
              </Pressable>
            </Link>
          </View>
        </Card>

        <Card variant="secondary" className="p-4">
          <View className="mb-3">
            <Card.Title>Recent transactions</Card.Title>
          </View>
          <View className="gap-1">
            {recentTxns.isLoading && <Skeleton className="h-32 w-full rounded-lg" />}
            {!recentTxns.isLoading && recentTxns.data?.items.length === 0 && (
              <Text className="text-muted text-sm">No transactions yet.</Text>
            )}
            {recentTxns.data?.items.map((t) => {
              const meta = categoryMeta(t.category);
              return (
                <View key={t.id} className="flex-row items-center justify-between gap-3 py-2.5">
                  <View className="flex-1 flex-row items-center gap-3">
                    <View className="size-8 items-center justify-center rounded-full bg-default">
                      <Ionicons name={meta.icon} size={16} color={mutedColor} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        {t.merchantName ?? "Unknown"}
                      </Text>
                      <Text className="text-muted text-xs">{formatIsoDate(t.date)}</Text>
                    </View>
                  </View>
                  <Text
                    className="font-medium"
                    style={{
                      color: t.amountCents < 0 ? successColor : foregroundColor,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {formatSignedCents(t.amountCents)}
                  </Text>
                </View>
              );
            })}
            <Link href="/transactions" asChild>
              <Pressable className="pt-2">
                <Text className="text-sm font-medium" style={{ color: accentColor }}>
                  View all transactions →
                </Text>
              </Pressable>
            </Link>
          </View>
        </Card>
      </View>
    </Container>
  );
}
