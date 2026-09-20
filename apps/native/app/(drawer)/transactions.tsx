import { Ionicons } from "@expo/vector-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, Card, Chip, SearchField, Select, Skeleton, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { StatCard } from "@/components/stat-card";
import { useActiveMember } from "@/contexts/active-member-context";
import { categoryMeta, KNOWN_CATEGORIES } from "@/lib/categories";
import { formatCents, formatIsoDate, formatSignedCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

// Mirror of apps/web/src/routes/_auth/transactions.tsx.
const PAGE_SIZE = 25;
const ALL_VALUE = "all";

export default function TransactionsScreen() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;
  const mutedColor = useThemeColor("muted");
  const successColor = useThemeColor("success");
  const foregroundColor = useThemeColor("foreground");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL_VALUE);
  const [bankAccountId, setBankAccountId] = useState<string>(ALL_VALUE);
  const [offset, setOffset] = useState(0);

  const accounts = useQuery(
    orpc.caretaker.transactions.accounts.queryOptions({
      input: { memberId: activeMemberId! },
      enabled,
    }),
  );

  const list = useQuery(
    orpc.caretaker.transactions.list.queryOptions({
      input: {
        memberId: activeMemberId!,
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        category: category === ALL_VALUE ? undefined : category,
        bankAccountId: bankAccountId === ALL_VALUE ? undefined : bankAccountId,
      },
      enabled,
      placeholderData: keepPreviousData,
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

  const categoryOption =
    category === ALL_VALUE
      ? { value: ALL_VALUE, label: "All categories" }
      : { value: category, label: categoryMeta(category).label };
  const accountList = accounts.data ?? [];
  const accountOption =
    bankAccountId === ALL_VALUE
      ? { value: ALL_VALUE, label: "All accounts" }
      : (() => {
          const a = accountList.find((x) => x.id === bankAccountId);
          return {
            value: bankAccountId,
            label: a ? `${a.name}${a.mask ? ` ••${a.mask}` : ""}` : "Account",
          };
        })();

  return (
    <Container className="p-4">
      <View className="gap-4 pb-6">
        <Text className="text-2xl font-semibold tracking-tight text-foreground">Transactions</Text>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatCard
              label="Count"
              value={list.data ? String(list.data.totals.count) : undefined}
            />
          </View>
          <View className="flex-1">
            <StatCard
              label="Expenses"
              value={list.data ? formatCents(list.data.totals.expenseCents) : undefined}
            />
          </View>
          <View className="flex-1">
            <StatCard
              label="Income"
              value={list.data ? formatCents(list.data.totals.incomeCents) : undefined}
            />
          </View>
        </View>

        <SearchField
          value={search}
          onChange={(value) => {
            setOffset(0);
            setSearch(value);
          }}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search merchant" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Select
              value={categoryOption}
              onValueChange={(option) => {
                const picked = Array.isArray(option) ? option[0] : option;
                if (!picked) return;
                setOffset(0);
                setCategory(picked.value);
              }}
            >
              <Select.Trigger>
                <Select.Value placeholder="Category" />
                <Select.TriggerIndicator />
              </Select.Trigger>
              <Select.Portal>
                <Select.Overlay />
                <Select.Content presentation="bottom-sheet">
                  <Select.ListLabel>Category</Select.ListLabel>
                  <Select.Item value={ALL_VALUE} label="All categories">
                    <Select.ItemLabel />
                    <Select.ItemIndicator />
                  </Select.Item>
                  {KNOWN_CATEGORIES.map((c) => (
                    <Select.Item key={c} value={c} label={categoryMeta(c).label}>
                      <Select.ItemLabel />
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Portal>
            </Select>
          </View>
          <View className="flex-1">
            <Select
              value={accountOption}
              onValueChange={(option) => {
                const picked = Array.isArray(option) ? option[0] : option;
                if (!picked) return;
                setOffset(0);
                setBankAccountId(picked.value);
              }}
            >
              <Select.Trigger>
                <Select.Value placeholder="Account" />
                <Select.TriggerIndicator />
              </Select.Trigger>
              <Select.Portal>
                <Select.Overlay />
                <Select.Content presentation="bottom-sheet">
                  <Select.ListLabel>Account</Select.ListLabel>
                  <Select.Item value={ALL_VALUE} label="All accounts">
                    <Select.ItemLabel />
                    <Select.ItemIndicator />
                  </Select.Item>
                  {accountList.map((a) => (
                    <Select.Item
                      key={a.id}
                      value={a.id}
                      label={`${a.name}${a.mask ? ` ••${a.mask}` : ""}`}
                    >
                      <Select.ItemLabel />
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Portal>
            </Select>
          </View>
        </View>

        <Card variant="secondary" className="p-4">
          {list.isLoading ? (
            <Skeleton className="h-96 w-full rounded-lg" />
          ) : (
            <View className="gap-1">
              {list.data?.items.length === 0 && (
                <Text className="text-muted py-6 text-center text-sm">
                  No transactions match these filters.
                </Text>
              )}
              {list.data?.items.map((t) => {
                const meta = categoryMeta(t.category);
                return (
                  <View
                    key={t.id}
                    className="flex-row items-center justify-between gap-3 border-b border-border py-2.5"
                  >
                    <View className="flex-1 flex-row items-center gap-3">
                      <View className="size-8 items-center justify-center rounded-full bg-default">
                        <Ionicons name={meta.icon} size={16} color={mutedColor} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                            {t.merchantName ?? "Unknown"}
                          </Text>
                          {t.pending && (
                            <Chip variant="secondary" size="sm">
                              <Chip.Label>Pending</Chip.Label>
                            </Chip>
                          )}
                        </View>
                        <Text className="text-muted text-xs">
                          {meta.label}
                          {t.accountName
                            ? ` · ${t.accountName}${t.accountMask ? ` ••${t.accountMask}` : ""}`
                            : ""}
                          {` · ${formatIsoDate(t.date)}`}
                        </Text>
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
            </View>
          )}
        </Card>

        <View className="flex-row items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            isDisabled={offset === 0}
            onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            <Button.Label>Previous</Button.Label>
          </Button>
          <Text className="text-muted text-xs">
            {list.data
              ? `${offset + 1}-${offset + list.data.items.length} of ${list.data.totals.count}`
              : ""}
          </Text>
          <Button
            variant="outline"
            size="sm"
            isDisabled={list.data?.nextOffset == null}
            onPress={() => {
              if (list.data?.nextOffset != null) setOffset(list.data.nextOffset);
            }}
          >
            <Button.Label>Next</Button.Label>
          </Button>
        </View>
      </View>
    </Container>
  );
}
