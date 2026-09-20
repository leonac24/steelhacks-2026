// Real accounts overview: cards for every linked account, plus a
// Plaid-style picker for adding one. "Demo Bank" is the only institution
// that actually connects — it mints a real Plaid Sandbox item (or a starter
// mock account when Plaid isn't configured) and backfills its transaction
// history right away. Every real-looking bank in the list is left in for
// the picker's sake but disabled, with an honest tooltip instead of
// silently doing nothing.
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
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
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@steelhacks-2026/ui/components/tooltip";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark, Pencil, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useActiveMember } from "@/hooks/use-active-member";
import { formatCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/accounts")({
  component: RouteComponent,
});

const DEMO_INSTITUTION = "Demo Bank";
const REAL_LOOKING_INSTITUTIONS = [
  "Chase",
  "Capital One",
  "Wells Fargo",
  "Bank of America",
  "American Express",
  "Citi",
] as const;

function RouteComponent() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;
  const queryClient = useQueryClient();

  const accounts = useQuery(
    orpc.caretaker.bank.accounts.list.queryOptions({
      input: { memberId: activeMemberId! },
      enabled,
    }),
  );
  const updateAccount = useMutation(
    orpc.caretaker.bank.accounts.update.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(),
    }),
  );

  if (membersLoading) return <Skeleton className="h-64 w-full" />;
  if (!enabled) {
    return <div className="text-muted-foreground text-sm">No members linked yet.</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-muted-foreground text-sm">
          Every account linked to this nester, and a way to connect another one.
        </p>
      </div>

      {accounts.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {!accounts.isLoading && accounts.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No bank connected yet — add Demo Bank below to see real data.
        </p>
      )}
      {!!accounts.data?.length && (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.data.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Landmark className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {a.name} {a.mask ? `••${a.mask}` : ""}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {formatCents(a.currentBalanceCents)} current
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {formatCents(a.availableBalanceCents)} available
                    </p>
                  </div>
                </div>
                <AccountDialog
                  account={a}
                  onSave={(changes) =>
                    updateAccount.mutate({ memberId: activeMemberId!, id: a.id, ...changes })
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!accounts.data?.length && <ConnectAccountCard memberId={activeMemberId!} />}
    </div>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-8 shrink-0" />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>Overrides the balance backing this demo account.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-name">Name</Label>
            <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-mask">Last 4 digits</Label>
            <Input
              id="account-mask"
              maxLength={4}
              value={mask}
              onChange={(e) => setMask(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-current">Current balance</Label>
              <Input
                id="account-current"
                type="number"
                step="0.01"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-available">Available balance</Label>
              <Input
                id="account-available"
                type="number"
                step="0.01"
                value={available}
                onChange={(e) => setAvailable(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectAccountCard({ memberId }: { memberId: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const connectDemo = useMutation(
    orpc.caretaker.bank.connectDemo.mutationOptions({
      onSuccess: (result) => {
        void queryClient.invalidateQueries();
        toast.success(
          result.alreadyConnected
            ? "Demo Bank was already connected"
            : `Connected Demo Bank — ${result.transactionsAdded} transactions backfilled`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const institutions = [DEMO_INSTITUTION, ...REAL_LOOKING_INSTITUTIONS].filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const isDemoSelected = selected === DEMO_INSTITUTION;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect banks &amp; credit cards</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 13,000+ institutions"
            className="h-11 pl-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {institutions.map((name) => {
            const isDemo = name === DEMO_INSTITUTION;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setSelected(name)}
                className={cn(
                  "flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-xs font-medium transition-colors",
                  selected === name
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/40 hover:bg-muted",
                )}
              >
                {isDemo ? <Sparkles className="size-5" /> : <Landmark className="size-5" />}
                {name}
              </button>
            );
          })}
          {institutions.length === 0 && (
            <p className="text-muted-foreground col-span-3 py-6 text-center text-sm">
              No institutions match &quot;{query}&quot;.
            </p>
          )}
        </div>

        {isDemoSelected ? (
          <Button
            className="w-full"
            disabled={connectDemo.isPending}
            onClick={() => connectDemo.mutate({ memberId })}
          >
            {connectDemo.isPending ? "Connecting…" : "Connect Demo Bank"}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={<span aria-disabled="true" className="w-full cursor-not-allowed" />}
            >
              <Button className="pointer-events-none w-full opacity-50" tabIndex={-1}>
                {selected ? `Connect to ${selected}` : "Connect account"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Disabled for demo!</TooltipContent>
          </Tooltip>
        )}
      </CardContent>
    </Card>
  );
}
