import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  Input,
  Label,
  Select,
  Skeleton,
  TextField,
  useThemeColor,
  useToast,
} from "heroui-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { Container } from "@/components/container";
import { useActiveMember } from "@/contexts/active-member-context";
import { categoryMeta, KNOWN_CATEGORIES } from "@/lib/categories";
import { formatCents, formatSignedCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

// Mirror of apps/web/src/routes/_auth/bank.tsx: admin tool for editing the
// seeded mock bank data used by the demo.
type TransactionRow = {
  id: string;
  date: string;
  merchantName: string | null;
  category: string;
  amountCents: number;
  pending: boolean;
  accountName: string | null;
  accountMask: string | null;
};

type AccountOption = { id: string; name: string; mask: string | null };

export default function BankScreen() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const dangerColor = useThemeColor("danger");
  const successColor = useThemeColor("success");
  const foregroundColor = useThemeColor("foreground");

  const accounts = useQuery(
    orpc.caretaker.bank.accounts.list.queryOptions({
      input: { memberId: activeMemberId! },
      enabled,
    }),
  );
  const txns = useQuery(
    orpc.caretaker.transactions.list.queryOptions({
      input: { memberId: activeMemberId!, limit: 100 },
      enabled,
    }),
  );

  function invalidateAll() {
    // Editing bank data touches balances, budgets, and every chart on the
    // dashboard; simplest to just refetch everything.
    void queryClient.invalidateQueries();
  }

  const updateAccount = useMutation(
    orpc.caretaker.bank.accounts.update.mutationOptions({ onSuccess: invalidateAll }),
  );
  const createTxn = useMutation(
    orpc.caretaker.bank.transactions.create.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        toast.show({ variant: "success", label: "Transaction added" });
      },
      onError: (error) => toast.show({ variant: "danger", label: error.message }),
    }),
  );
  const updateTxn = useMutation(
    orpc.caretaker.bank.transactions.update.mutationOptions({
      onSuccess: invalidateAll,
      onError: (error) => toast.show({ variant: "danger", label: error.message }),
    }),
  );
  const deleteTxn = useMutation(
    orpc.caretaker.bank.transactions.delete.mutationOptions({
      onSuccess: invalidateAll,
      onError: (error) => toast.show({ variant: "danger", label: error.message }),
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

  const accountOptions: AccountOption[] = (accounts.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    mask: a.mask,
  }));
  const firstAccountId = accountOptions[0]?.id;

  return (
    <Container className="p-4">
      <View className="gap-4 pb-6">
        <View>
          <Text className="text-2xl font-semibold tracking-tight text-foreground">Bank data</Text>
          <Text className="text-muted text-sm">
            Admin tool for editing the seeded mock bank data used by this demo.
          </Text>
        </View>

        <Card variant="secondary" className="p-4">
          <Card.Title className="mb-3">Accounts</Card.Title>
          {accounts.isLoading && <Skeleton className="h-16 w-full rounded-lg" />}
          <View className="gap-3">
            {accounts.data?.map((a) => (
              <View key={a.id} className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-medium text-foreground">
                    {a.name} {a.mask ? `••${a.mask}` : ""}
                  </Text>
                  <Text className="text-muted text-sm">
                    {formatCents(a.currentBalanceCents)} current ·{" "}
                    {formatCents(a.availableBalanceCents)} available
                  </Text>
                </View>
                <AccountDialog
                  account={a}
                  onSave={(changes) =>
                    updateAccount.mutate({ memberId: activeMemberId, id: a.id, ...changes })
                  }
                />
              </View>
            ))}
          </View>
        </Card>

        <Card variant="secondary" className="p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Card.Title>Transactions</Card.Title>
            {firstAccountId && (
              <TransactionDialog
                accounts={accountOptions}
                defaultAccountId={firstAccountId}
                triggerLabel="Add"
                onSave={(input) => createTxn.mutate({ memberId: activeMemberId, ...input })}
              />
            )}
          </View>
          {txns.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <View className="gap-1">
              {txns.data?.items.map((t) => (
                <View
                  key={t.id}
                  className="flex-row items-center justify-between gap-2 border-b border-border py-2.5"
                >
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
                      {t.date} · {categoryMeta(t.category).label}
                    </Text>
                  </View>
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color: t.amountCents < 0 ? successColor : foregroundColor,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {formatSignedCents(t.amountCents)}
                  </Text>
                  <View className="flex-row">
                    <TransactionDialog
                      accounts={accountOptions}
                      existing={t}
                      onSave={(input) =>
                        updateTxn.mutate({ memberId: activeMemberId, id: t.id, ...input })
                      }
                    />
                    <Button
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      onPress={() => deleteTxn.mutate({ memberId: activeMemberId, id: t.id })}
                    >
                      <Ionicons name="trash-outline" size={16} color={dangerColor} />
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>
    </Container>
  );
}

function AccountDialog({
  account,
  onSave,
}: {
  account: {
    name: string;
    mask: string | null;
    currentBalanceCents: number;
    availableBalanceCents: number;
  };
  onSave: (changes: {
    name: string;
    mask: string | null;
    currentBalanceCents: number;
    availableBalanceCents: number;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account.name);
  const [mask, setMask] = useState(account.mask ?? "");
  const [current, setCurrent] = useState(String(account.currentBalanceCents / 100));
  const [available, setAvailable] = useState(String(account.availableBalanceCents / 100));

  function submit() {
    onSave({
      name,
      mask: mask || null,
      currentBalanceCents: Math.round(Number(current) * 100),
      availableBalanceCents: Math.round(Number(available) * 100),
    });
    setOpen(false);
  }

  return (
    <Dialog isOpen={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="outline" size="sm">
          <Button.Label>Edit</Button.Label>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Dialog.Content>
            <Dialog.Close />
            <View className="mb-4 gap-1.5">
              <Dialog.Title>Edit account</Dialog.Title>
              <Dialog.Description>
                Overrides the seeded balance for the mock provider.
              </Dialog.Description>
            </View>
            <View className="gap-4">
              <TextField>
                <Label>Name</Label>
                <Input value={name} onChangeText={setName} />
              </TextField>
              <TextField>
                <Label>Last 4 digits</Label>
                <Input
                  value={mask}
                  onChangeText={setMask}
                  maxLength={4}
                  keyboardType="number-pad"
                />
              </TextField>
              <TextField>
                <Label>Current balance</Label>
                <Input value={current} onChangeText={setCurrent} keyboardType="decimal-pad" />
              </TextField>
              <TextField>
                <Label>Available balance</Label>
                <Input value={available} onChangeText={setAvailable} keyboardType="decimal-pad" />
              </TextField>
              <Button onPress={submit}>
                <Button.Label>Save</Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
}

type TxnInput = {
  bankAccountId: string;
  date: string;
  merchantName: string;
  category: string;
  amountCents: number;
  pending: boolean;
};

function TransactionDialog({
  accounts,
  defaultAccountId,
  existing,
  triggerLabel,
  onSave,
}: {
  accounts: AccountOption[];
  defaultAccountId?: string;
  existing?: TransactionRow & { bankAccountId?: string };
  triggerLabel?: string;
  onSave: (input: TxnInput) => void;
}) {
  const mutedColor = useThemeColor("muted");
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState(
    existing?.bankAccountId ?? defaultAccountId ?? "",
  );
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [merchantName, setMerchantName] = useState(existing?.merchantName ?? "");
  const [category, setCategory] = useState(existing?.category ?? KNOWN_CATEGORIES[0]!);
  const [isExpense, setIsExpense] = useState((existing?.amountCents ?? 1) >= 0);
  const [amount, setAmount] = useState(
    existing ? String(Math.abs(existing.amountCents) / 100) : "",
  );
  const [pending, setPending] = useState(existing?.pending ?? false);

  function submit() {
    const dollars = Number(amount);
    if (!merchantName || !bankAccountId || !Number.isFinite(dollars) || dollars <= 0) return;
    const cents = Math.round(dollars * 100);
    onSave({
      bankAccountId,
      date,
      merchantName,
      category,
      amountCents: isExpense ? cents : -cents,
      pending,
    });
    setOpen(false);
  }

  const selectedAccount = accounts.find((a) => a.id === bankAccountId);
  const accountOption = selectedAccount
    ? {
        value: selectedAccount.id,
        label: `${selectedAccount.name}${selectedAccount.mask ? ` ••${selectedAccount.mask}` : ""}`,
      }
    : undefined;

  return (
    <Dialog isOpen={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {triggerLabel ? (
          <Button size="sm">
            <Button.Label>{triggerLabel}</Button.Label>
          </Button>
        ) : (
          <Button isIconOnly variant="ghost" size="sm">
            <Ionicons name="pencil-outline" size={16} color={mutedColor} />
          </Button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Dialog.Content>
            <Dialog.Close />
            <View className="mb-4 gap-1.5">
              <Dialog.Title>{existing ? "Edit transaction" : "Add transaction"}</Dialog.Title>
              <Dialog.Description>
                Writes directly to the mock bank data used by this demo.
              </Dialog.Description>
            </View>
            <ScrollView className="max-h-96" keyboardShouldPersistTaps="handled">
              <View className="gap-4">
                {!existing && accounts.length > 1 && (
                  <View className="gap-2">
                    <Label>Account</Label>
                    <Select
                      value={accountOption}
                      onValueChange={(option) => {
                        const picked = Array.isArray(option) ? option[0] : option;
                        if (picked) setBankAccountId(picked.value);
                      }}
                    >
                      <Select.Trigger>
                        <Select.Value placeholder="Choose an account" />
                        <Select.TriggerIndicator />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Overlay />
                        <Select.Content presentation="bottom-sheet">
                          <Select.ListLabel>Account</Select.ListLabel>
                          {accounts.map((a) => (
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
                )}
                <TextField>
                  <Label>Merchant</Label>
                  <Input value={merchantName} onChangeText={setMerchantName} />
                </TextField>
                <TextField>
                  <Label>Date (YYYY-MM-DD)</Label>
                  <Input
                    value={date}
                    onChangeText={setDate}
                    placeholder="2026-01-31"
                    autoCapitalize="none"
                  />
                </TextField>
                <View className="gap-2">
                  <Label>Category</Label>
                  <Select
                    value={{ value: category, label: categoryMeta(category).label }}
                    onValueChange={(option) => {
                      const picked = Array.isArray(option) ? option[0] : option;
                      if (picked) setCategory(picked.value);
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
                <TextField>
                  <Label>Amount</Label>
                  <Input
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                </TextField>
                <View className="gap-2">
                  <Label>Type</Label>
                  <Select
                    value={{
                      value: isExpense ? "expense" : "deposit",
                      label: isExpense ? "Expense (money out)" : "Deposit (money in)",
                    }}
                    onValueChange={(option) => {
                      const picked = Array.isArray(option) ? option[0] : option;
                      if (picked) setIsExpense(picked.value === "expense");
                    }}
                  >
                    <Select.Trigger>
                      <Select.Value placeholder="Type" />
                      <Select.TriggerIndicator />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Overlay />
                      <Select.Content presentation="bottom-sheet">
                        <Select.Item value="expense" label="Expense (money out)">
                          <Select.ItemLabel />
                          <Select.ItemIndicator />
                        </Select.Item>
                        <Select.Item value="deposit" label="Deposit (money in)">
                          <Select.ItemLabel />
                          <Select.ItemIndicator />
                        </Select.Item>
                      </Select.Content>
                    </Select.Portal>
                  </Select>
                </View>
                <View className="flex-row items-center gap-2">
                  <Checkbox isSelected={pending} onSelectedChange={setPending} />
                  <Label>Pending</Label>
                </View>
                <Button onPress={submit}>
                  <Button.Label>Save</Button.Label>
                </Button>
              </View>
            </ScrollView>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
}
