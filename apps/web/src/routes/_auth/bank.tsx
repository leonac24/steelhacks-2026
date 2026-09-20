import { Badge } from "@steelhacks-2026/ui/components/badge";
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Checkbox } from "@steelhacks-2026/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@steelhacks-2026/ui/components/dialog";
import { Input } from "@steelhacks-2026/ui/components/input";
import { Label } from "@steelhacks-2026/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@steelhacks-2026/ui/components/select";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@steelhacks-2026/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { useActiveMember } from "@/hooks/use-active-member";
import { categoryMeta, KNOWN_CATEGORIES } from "@/lib/categories";
import { formatSignedCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/bank")({
  component: RouteComponent,
});

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

function RouteComponent() {
  const { activeMember, activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;
  const queryClient = useQueryClient();

  const onDemoError = (error: Error) => toast.error(error.message);
  const refreshAll = () => void queryClient.invalidateQueries({ queryKey: orpc.caretaker.key() });

  const injectTransaction = useMutation({
    ...orpc.dev.injectTransaction.mutationOptions(),
    onSuccess: () => {
      toast.success("Transaction posted");
      refreshAll();
    },
    onError: onDemoError,
  });
  const runAlerts = useMutation({
    ...orpc.dev.runAlerts.mutationOptions(),
    onSuccess: () => {
      toast.success("Alerts evaluated");
      refreshAll();
    },
    onError: onDemoError,
  });
  const processApprovals = useMutation({
    ...orpc.dev.processApprovals.mutationOptions(),
    onSuccess: (result) => {
      toast.success(`${result.applied} applied, ${result.expired} expired`);
      refreshAll();
    },
    onError: onDemoError,
  });
  const callMe = useMutation({
    ...orpc.dev.callMe.mutationOptions(),
    onSuccess: () => {
      toast.success("Calling now — pick up!");
      refreshAll();
    },
    onError: onDemoError,
  });
  const demoBusy =
    injectTransaction.isPending ||
    runAlerts.isPending ||
    processApprovals.isPending ||
    callMe.isPending;

  const accounts = useQuery(
    orpc.caretaker.bank.accounts.list.queryOptions({
      input: { memberId: activeMemberId! },
      enabled,
    }),
  );
  // Only needed here to pick a default account for new transactions — the
  // account cards themselves live on /accounts now.
  const txns = useQuery(
    orpc.caretaker.transactions.list.queryOptions({
      input: { memberId: activeMemberId!, limit: 100 },
      enabled,
    }),
  );

  function invalidateAll() {
    // Editing bank data touches balances, budgets, and every chart on the
    // dashboard; simplest to just refetch everything rather than chase down
    // every derived query.
    void queryClient.invalidateQueries();
  }

  const createTxn = useMutation(
    orpc.caretaker.bank.transactions.create.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        toast.success("Transaction added");
      },
    }),
  );
  const updateTxn = useMutation(
    orpc.caretaker.bank.transactions.update.mutationOptions({ onSuccess: invalidateAll }),
  );
  const deleteTxn = useMutation(
    orpc.caretaker.bank.transactions.delete.mutationOptions({ onSuccess: invalidateAll }),
  );

  if (membersLoading) return <Skeleton className="h-64 w-full" />;
  if (!enabled) {
    return <div className="text-muted-foreground text-sm">No members linked yet.</div>;
  }

  const firstAccountId = accounts.data?.[0]?.id;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Bank simulator</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            This page is a demo-only tool for simulating what happens to{" "}
            {activeMember?.preferredName ?? "this nester"}&apos;s mock bank data. Nothing here talks
            to a real bank. Post transactions by hand below, or fire one of the scripted demo beats
            to show the caretaker/nester story live.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live demo beats</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Each button stands in for something that normally happens on its own — a bank webhook, a
            phone call, a nightly cron run. Keep{" "}
            <Link to="/dashboard" className="underline underline-offset-4">
              the dashboard
            </Link>{" "}
            open in another tab to watch it update.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={demoBusy || !activeMemberId}
              onClick={() =>
                injectTransaction.mutate({
                  memberId: activeMemberId!,
                  amountCents: 40_000,
                  merchantName: "QuikCash Gift Cards",
                  category: "other",
                })
              }
            >
              Post $400 unusual charge
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={demoBusy || !activeMemberId}
              onClick={() =>
                injectTransaction.mutate({
                  memberId: activeMemberId!,
                  amountCents: -184_200,
                  merchantName: "Social Security Administration",
                  category: "income",
                })
              }
            >
              Deposit $1,842
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={demoBusy || !activeMemberId}
              onClick={() => runAlerts.mutate({ memberId: activeMemberId! })}
            >
              Run alerts
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={demoBusy}
              onClick={() => processApprovals.mutate({})}
            >
              Process approvals (a day passes)
            </Button>
            <Button
              size="sm"
              disabled={demoBusy || !activeMemberId}
              onClick={() => callMe.mutate({ memberId: activeMemberId! })}
            >
              <Phone className="size-4" />
              {callMe.isPending ? "Calling…" : "Call me"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            "Call me" places a real outbound call through ElevenLabs to{" "}
            {activeMember?.preferredName ?? "this nester"}&apos;s own phone number — needs
            ELEVENLABS_API_KEY/ELEVENLABS_AGENT_ID/ELEVENLABS_PHONE_NUMBER_ID configured.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transactions</CardTitle>
          {firstAccountId && (
            <TransactionDialog
              accounts={accounts.data ?? []}
              defaultAccountId={firstAccountId}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" />
                  Add transaction
                </Button>
              }
              onSave={(input) => createTxn.mutate({ memberId: activeMemberId!, ...input })}
            />
          )}
        </CardHeader>
        <CardContent className="p-0">
          {txns.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.data?.items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">{t.date}</TableCell>
                    <TableCell className="font-medium">
                      {t.merchantName ?? "Unknown"}
                      {t.pending && (
                        <Badge variant="secondary" className="ml-2">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{categoryMeta(t.category).label}</Badge>
                    </TableCell>
                    <TableCell
                      className={
                        "text-right font-medium" + (t.amountCents < 0 ? " text-green-500" : "")
                      }
                    >
                      {formatSignedCents(t.amountCents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <TransactionDialog
                          accounts={accounts.data ?? []}
                          existing={t}
                          trigger={
                            <Button variant="ghost" size="icon" className="size-8">
                              <Pencil className="size-4" />
                            </Button>
                          }
                          onSave={(input) =>
                            updateTxn.mutate({ memberId: activeMemberId!, id: t.id, ...input })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => deleteTxn.mutate({ memberId: activeMemberId!, id: t.id })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
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
  trigger,
  onSave,
}: {
  accounts: { id: string; name: string; mask: string | null }[];
  defaultAccountId?: string;
  existing?: TransactionRow & { bankAccountId?: string };
  trigger: ReactElement;
  onSave: (input: TxnInput) => void;
}) {
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            Writes directly to the mock bank data used by this demo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {!existing && accounts.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label>Account</Label>
              <Select value={bankAccountId} onValueChange={(v) => v && setBankAccountId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} {a.mask ? `••${a.mask}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="txn-merchant">Merchant</Label>
              <Input
                id="txn-merchant"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="txn-date">Date</Label>
              <Input
                id="txn-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryMeta(c).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="txn-amount">Amount</Label>
              <Input
                id="txn-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select
              value={isExpense ? "expense" : "deposit"}
              onValueChange={(v) => v && setIsExpense(v === "expense")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense (money out)</SelectItem>
                <SelectItem value="deposit">Deposit (money in)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="txn-pending"
              checked={pending}
              onCheckedChange={(checked) => setPending(checked === true)}
            />
            <Label htmlFor="txn-pending">Pending</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
