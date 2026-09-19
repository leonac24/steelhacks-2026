// The remote control for the live demo. Every button here stands in for
// something that normally happens on its own — a bank webhook, a phone call,
// a nightly cron run — so the whole story can be told from one screen.
//
// These call dev.* procedures, which 404 unless DEV_TOOLS_ENABLED is on.
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { useActiveMember } from "@/lib/use-active-member";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/demo")({
  component: DemoRoute,
});

function DemoRoute() {
  const { member, memberId } = useActiveMember();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.caretaker.key() });

  const onError = (error: Error) => toast.error(error.message);

  const injectTransaction = useMutation({
    ...orpc.dev.injectTransaction.mutationOptions(),
    onSuccess: () => {
      toast.success("Transaction posted");
      refresh();
    },
    onError,
  });

  const simulateVoiceChange = useMutation({
    ...orpc.dev.simulateVoiceChange.mutationOptions(),
    onSuccess: (result) => {
      toast.success(
        result.status === "awaiting_approval"
          ? "Waiting for your approval"
          : `Applied: ${result.summaryText}`,
      );
      refresh();
    },
    onError,
  });

  const runAlerts = useMutation({
    ...orpc.dev.runAlerts.mutationOptions(),
    onSuccess: () => {
      toast.success("Alerts evaluated");
      refresh();
    },
    onError,
  });

  const processApprovals = useMutation({
    ...orpc.dev.processApprovals.mutationOptions(),
    onSuccess: (result) => {
      toast.success(`${result.applied} applied, ${result.expired} expired`);
      refresh();
    },
    onError,
  });

  if (!memberId) {
    return <p className="p-6 text-muted-foreground">No members linked to this account.</p>;
  }

  const busy =
    injectTransaction.isPending ||
    simulateVoiceChange.isPending ||
    runAlerts.isPending ||
    processApprovals.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Demo controls</h1>
        <p className="text-sm text-muted-foreground">
          Acting on {member?.preferredName}. Keep{" "}
          <Link to="/dashboard" className="underline underline-offset-4">
            the dashboard
          </Link>{" "}
          open in another window — it polls every 3 seconds.
        </p>
      </div>

      <Step
        n={1}
        title="An unusual charge lands"
        description="Posts a $400 gift-card purchase and moves the balance, the way a bank webhook would."
        action="Charge $400"
        disabled={busy}
        onClick={() =>
          injectTransaction.mutate({
            memberId,
            amountCents: 40_000,
            merchantName: "QuikCash Gift Cards",
            category: "other",
          })
        }
      />

      <Step
        n={2}
        title="June notices"
        description="Runs the alert engine against the new transaction and places a call if a rule fires."
        action="Run alerts"
        disabled={busy}
        onClick={() => runAlerts.mutate({ memberId })}
        note="Not wired until milestone 9 — expect a 'not built yet' error for now."
      />

      <Step
        n={3}
        title="Dot asks June to lower her safety cushion"
        description="Proposes and confirms a change by voice. This one is needs_approval, so it lands in your queue instead of applying."
        action="Simulate the call"
        disabled={busy}
        onClick={() =>
          simulateVoiceChange.mutate({
            memberId,
            changeType: "safety_buffer_update",
            payload: { safetyBufferCents: 1_000 },
          })
        }
      />

      <Step
        n={4}
        title="Dot asks to raise her grocery budget"
        description="Raising a budget is instant_notify — it applies right away and tells you after. Good contrast with step 3."
        action="Simulate the call"
        disabled={busy}
        onClick={() =>
          simulateVoiceChange.mutate({
            memberId,
            changeType: "budget_update",
            payload: { category: "groceries", monthlyLimitCents: 30_000 },
          })
        }
      />

      <Step
        n={5}
        title="A deposit arrives"
        description="Negative amount means money in. Watch safe-to-spend jump."
        action="Deposit $1,842"
        disabled={busy}
        onClick={() =>
          injectTransaction.mutate({
            memberId,
            amountCents: -184_200,
            merchantName: "Social Security Administration",
            category: "income",
          })
        }
      />

      <Step
        n={6}
        title="A day passes"
        description="Settles every approval past its deadline, the way the nightly cron will."
        action="Process approvals"
        disabled={busy}
        onClick={() => processApprovals.mutate({})}
      />
    </div>
  );
}

function Step({
  n,
  title,
  description,
  action,
  onClick,
  disabled,
  note,
}: {
  n: number;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  disabled: boolean;
  note?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {n}. {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-md space-y-1">
          <p className="text-muted-foreground">{description}</p>
          {note && <p className="text-xs text-destructive">{note}</p>}
        </div>
        <Button onClick={onClick} disabled={disabled}>
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}
