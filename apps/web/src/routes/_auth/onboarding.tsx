// Structured (skippable) onboarding for a freshly created steward: pick a
// starter bank account, pick an assistant voice, and set alert preferences.
// Every step, and the flow as a whole, can be skipped straight to the
// dashboard — none of this is required to use the app.
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Checkbox } from "@steelhacks-2026/ui/components/checkbox";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@steelhacks-2026/ui/components/tooltip";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Landmark, Sparkles, Volume2 } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { toast } from "sonner";

import { useActiveMember } from "@/hooks/use-active-member";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/onboarding")({
  component: RouteComponent,
});

const STEPS = ["Bank account", "Assistant", "Alerts"] as const;

const DEMO_INSTITUTION = "Demo Bank";
const REAL_LOOKING_INSTITUTIONS = ["Chase", "Capital One", "Wells Fargo", "Bank of America"];

type AssistantId = "Jay" | "Robin";
const ASSISTANTS: { id: AssistantId; emoji: string; blurb: string; sound: string }[] = [
  {
    id: "Robin",
    emoji: "🐦‍🔥",
    blurb: "Warm and a little slower.",
    sound: "/sounds/robin.wav",
  },
  { id: "Jay", emoji: "🐦", blurb: "Bright and to the point.", sound: "/sounds/jay.wav" },
];

type AlertType = "budget_reached" | "unusual_txn" | "deposit_arrived";
const ALERT_ROWS: { type: AlertType; label: string; description: string }[] = [
  {
    type: "budget_reached",
    label: "Budget reached",
    description: "A category budget is over, or on pace to go over.",
  },
  {
    type: "unusual_txn",
    label: "Potential fraud",
    description: "A charge that doesn't look like the usual pattern.",
  },
  {
    type: "deposit_arrived",
    label: "New significant deposit",
    description: "A deposit large enough to be worth flagging.",
  },
];

type Recipients = Record<AlertType, { steward: boolean; nester: boolean }>;
const DEFAULT_RECIPIENTS: Recipients = {
  budget_reached: { steward: true, nester: false },
  unusual_txn: { steward: true, nester: true },
  deposit_arrived: { steward: true, nester: true },
};

function RouteComponent() {
  const navigate = useNavigate();
  const { activeMemberId, isLoading } = useActiveMember();
  const [step, setStep] = useState(0);

  if (isLoading || !activeMemberId) {
    return (
      <div className="mx-auto w-full max-w-xl p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  function finish() {
    void navigate({ to: "/dashboard" });
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s get set up</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={finish}>
          Skip setup
        </Button>
      </div>

      <div className="flex gap-1.5">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      {step === 0 && (
        <BankStep
          memberId={activeMemberId}
          onNext={() => setStep(1)}
          onSkip={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <AssistantStep
          memberId={activeMemberId}
          onNext={() => setStep(2)}
          onSkip={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <AlertsStep memberId={activeMemberId} onFinish={finish} onSkip={finish} />
      )}
    </div>
  );
}

function BankStep({
  memberId,
  onNext,
  onSkip,
}: {
  memberId: string;
  onNext: () => void;
  onSkip: () => void;
}) {
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
        onNext();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const institutions = [DEMO_INSTITUTION, ...REAL_LOOKING_INSTITUTIONS];
  const isDemoSelected = selected === DEMO_INSTITUTION;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a starter bank account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Demo Bank is the only one that actually connects — it backfills real Plaid Sandbox
          history so there&apos;s something to look at right away.
        </p>
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
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip this step
          </Button>
          {isDemoSelected ? (
            <Button disabled={connectDemo.isPending} onClick={() => connectDemo.mutate({ memberId })}>
              {connectDemo.isPending ? "Connecting…" : "Connect Demo Bank"}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span aria-disabled="true" className="cursor-not-allowed" />}>
                <Button className="pointer-events-none opacity-50" tabIndex={-1}>
                  Connect account
                </Button>
              </TooltipTrigger>
              <TooltipContent>Disabled for demo!</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AssistantStep({
  memberId,
  onNext,
  onSkip,
}: {
  memberId: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<AssistantId>("Robin");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const updateSettings = useMutation(
    orpc.caretaker.settings.update.mutationOptions({
      onSuccess: () => {
        toast.success(`${selected} is your assistant now`);
        onNext();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function playSample(sound: string) {
    audioRef.current?.pause();
    const audio = new Audio(sound);
    audioRef.current = audio;
    void audio.play();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose your assistant</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">

        <div className="grid grid-cols-2 gap-3">
          {ASSISTANTS.map((assistant) => (
            <button
              key={assistant.id}
              type="button"
              onClick={() => setSelected(assistant.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                selected === assistant.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/40 hover:bg-muted",
              )}
            >
              <span className="text-4xl">{assistant.emoji}</span>
              <span className="font-medium">{assistant.id}</span>
              <span className="text-muted-foreground text-xs">{assistant.blurb}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Play a sample of ${assistant.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  playSample(assistant.sound);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    playSample(assistant.sound);
                  }
                }}
                className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-4"
              >
                <Volume2 className="size-3.5" />
                Play sample
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip this step
          </Button>
          <Button
            disabled={updateSettings.isPending}
            onClick={() => updateSettings.mutate({ memberId, assistantName: selected })}
          >
            {updateSettings.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsStep({
  memberId,
  onFinish,
  onSkip,
}: {
  memberId: string;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const [recipients, setRecipients] = useState<Recipients>(DEFAULT_RECIPIENTS);
  const updateAlertRule = useMutation(orpc.caretaker.alertRules.update.mutationOptions());
  const [isSaving, setIsSaving] = useState(false);

  function toggle(type: AlertType, who: "steward" | "nester", checked: boolean) {
    setRecipients((prev) => ({ ...prev, [type]: { ...prev[type], [who]: checked } }));
  }

  async function saveAndFinish() {
    setIsSaving(true);
    try {
      await Promise.all(
        ALERT_ROWS.map((row) => {
          const r = recipients[row.type];
          return updateAlertRule.mutateAsync({
            memberId,
            type: row.type,
            enabled: r.steward || r.nester,
            notifySteward: r.steward,
            notifyNester: r.nester,
          });
        }),
      );
      toast.success("Alert preferences saved");
      onFinish();
    } catch (error) {
      setIsSaving(false);
      toast.error(error instanceof Error ? error.message : "Couldn't save alert preferences");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts &amp; who's contacted</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-3 text-sm">
          <span className="text-muted-foreground text-xs uppercase" />
          <span className="text-muted-foreground text-xs uppercase">Steward</span>
          <span className="text-muted-foreground text-xs uppercase">Nester</span>

          {ALERT_ROWS.map((row) => (
            <Fragment key={row.type}>
              <div>
                <p className="font-medium">{row.label}</p>
                <p className="text-muted-foreground text-xs">{row.description}</p>
              </div>
              <Checkbox
                checked={recipients[row.type].steward}
                onCheckedChange={(checked) => toggle(row.type, "steward", checked === true)}
              />
              <Checkbox
                checked={recipients[row.type].nester}
                onCheckedChange={(checked) => toggle(row.type, "nester", checked === true)}
              />
            </Fragment>
          ))}

          <div className="opacity-50">
            <p className="font-medium">
              Once a week briefing <span className="text-muted-foreground text-xs">(coming soon)</span>
            </p>
            <p className="text-muted-foreground text-xs">A weekly summary instead of one-off calls.</p>
          </div>
          <Checkbox disabled />
          <Checkbox disabled />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip this step
          </Button>
          <Button disabled={isSaving} onClick={saveAndFinish}>
            {isSaving ? "Saving…" : "Finish setup"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
