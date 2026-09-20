import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Dialog,
  Input,
  Label,
  Select,
  Skeleton,
  TextField,
  useThemeColor,
} from "heroui-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { Container } from "@/components/container";
import { ProgressBar } from "@/components/progress-bar";
import { useActiveMember } from "@/contexts/active-member-context";
import { categoryMeta, KNOWN_CATEGORIES } from "@/lib/categories";
import { formatCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

// Mirror of apps/web/src/routes/_auth/budget.tsx.
export default function BudgetScreen() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;
  const queryClient = useQueryClient();
  const mutedColor = useThemeColor("muted");
  const dangerColor = useThemeColor("danger");

  const budgets = useQuery(
    orpc.caretaker.budgets.list.queryOptions({ input: { memberId: activeMemberId! }, enabled }),
  );
  const breakdown = useQuery(
    orpc.caretaker.insights.categoryBreakdown.queryOptions({
      input: { memberId: activeMemberId!, days: 30 },
      enabled,
    }),
  );

  const upsert = useMutation(
    orpc.caretaker.budgets.upsert.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.caretaker.budgets.list.queryKey({ input: { memberId: activeMemberId! } }),
        });
      },
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

  const spentByCategory = new Map((breakdown.data ?? []).map((c) => [c.category, c.totalCents]));
  const budgetedCategories = new Set((budgets.data ?? []).map((b) => b.category));
  const totalLimit = (budgets.data ?? []).reduce((sum, b) => sum + b.monthlyLimitCents, 0);
  const totalSpent = (budgets.data ?? []).reduce(
    (sum, b) => sum + (spentByCategory.get(b.category) ?? 0),
    0,
  );
  const overTotal = totalSpent > totalLimit;

  return (
    <Container className="p-4">
      <View className="gap-4 pb-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-semibold tracking-tight text-foreground">Budget</Text>
          <BudgetDialog
            memberId={activeMemberId}
            excludeCategories={budgetedCategories}
            onSave={(input) => upsert.mutate(input)}
          />
        </View>

        <Card variant="secondary" className="p-4">
          <Card.Title className="mb-3">This month</Card.Title>
          <View className="flex-row items-center justify-between">
            <View>
              <Text
                className="text-2xl font-semibold tracking-tight text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {formatCents(totalSpent)}
              </Text>
              <Text className="text-muted text-sm">of {formatCents(totalLimit)} budgeted</Text>
            </View>
            <Text className="font-medium" style={{ color: overTotal ? dangerColor : mutedColor }}>
              {formatCents(Math.abs(totalLimit - totalSpent))} {overTotal ? "over" : "remaining"}
            </Text>
          </View>
        </Card>

        <Card variant="secondary" className="p-4">
          {budgets.isLoading && <Skeleton className="h-64 w-full rounded-lg" />}
          {!budgets.isLoading && budgets.data?.length === 0 && (
            <Text className="text-muted py-6 text-center text-sm">
              No budgets yet. Add one to start tracking spend against a limit.
            </Text>
          )}
          <View className="gap-4">
            {budgets.data?.map((b) => {
              const meta = categoryMeta(b.category);
              const spent = spentByCategory.get(b.category) ?? 0;
              const over = spent > b.monthlyLimitCents;
              const pct = (spent / Math.max(b.monthlyLimitCents, 1)) * 100;
              return (
                <View key={b.id} className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium text-foreground">{meta.label}</Text>
                    <Text className="text-sm" style={{ color: over ? dangerColor : mutedColor }}>
                      {formatCents(spent)} / {formatCents(b.monthlyLimitCents)}
                    </Text>
                  </View>
                  <ProgressBar value={pct} danger={over} />
                </View>
              );
            })}
          </View>
        </Card>
      </View>
    </Container>
  );
}

function BudgetDialog({
  memberId,
  excludeCategories,
  onSave,
}: {
  memberId: string;
  excludeCategories: Set<string>;
  onSave: (input: { memberId: string; category: string; monthlyLimitCents: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const options = KNOWN_CATEGORIES.filter((c) => !excludeCategories.has(c));

  function submit() {
    const dollars = Number(amount);
    if (!category || !Number.isFinite(dollars) || dollars <= 0) return;
    onSave({ memberId, category, monthlyLimitCents: Math.round(dollars * 100) });
    setOpen(false);
    setCategory("");
    setAmount("");
  }

  const selectedOption = category
    ? { value: category, label: categoryMeta(category).label }
    : undefined;

  return (
    <Dialog isOpen={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm">
          <Button.Label>Add budget</Button.Label>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Dialog.Content>
            <Dialog.Close />
            <View className="mb-4 gap-1.5">
              <Dialog.Title>Add a budget</Dialog.Title>
              <Dialog.Description>Set a monthly spending limit for a category.</Dialog.Description>
            </View>
            <View className="gap-4">
              <View className="gap-2">
                <Label>Category</Label>
                <Select
                  value={selectedOption}
                  onValueChange={(option) => {
                    const picked = Array.isArray(option) ? option[0] : option;
                    if (picked) setCategory(picked.value);
                  }}
                >
                  <Select.Trigger>
                    <Select.Value placeholder="Choose a category" />
                    <Select.TriggerIndicator />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Overlay />
                    <Select.Content presentation="bottom-sheet">
                      <Select.ListLabel>Category</Select.ListLabel>
                      {options.map((c) => (
                        <Select.Item key={c} value={c} label={categoryMeta(c).label}>
                          <Select.ItemLabel />
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Portal>
                </Select>
              </View>
              <TextField>
                <Label>Monthly limit</Label>
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </TextField>
              <Button onPress={submit} isDisabled={!category || !Number(amount)}>
                <Button.Label>Save</Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
}
