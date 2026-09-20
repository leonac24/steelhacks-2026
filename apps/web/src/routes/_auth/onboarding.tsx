// Structured (skippable) onboarding for a freshly created steward: set the
// voice-line PIN, pick a starter bank account, pick an assistant voice, and
// set alert preferences. Every step, and the flow as a whole, can be
// skipped straight to the dashboard — none of this is required to use the
// app.
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Checkbox } from "@steelhacks-2026/ui/components/checkbox";
import { Input } from "@steelhacks-2026/ui/components/input";
import { Label } from "@steelhacks-2026/ui/components/label";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@steelhacks-2026/ui/components/tooltip";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Landmark, Sparkles, Volume2 } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { toast } from "sonner";

import { useActiveMember } from "@/hooks/use-active-member";
import {
  ALERT_ROWS,
  ASSISTANTS,
  DEFAULT_RECIPIENTS,
  type AlertType,
  type AssistantId,
  type Recipients,
} from "@/lib/assistant";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/onboarding")({
  component: RouteComponent,
});

const STEPS = ["Phone PIN", "Bank account", "Assistant", "Alerts"] as const;

const DEMO_INSTITUTION = "Demo Bank";
const REAL_LOOKING_INSTITUTIONS = ["Chase", "Capital One", "Wells Fargo", "Bank of America"];

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
            className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>

      {step === 0 && (
        <PinStep memberId={activeMemberId} onNext={() => setStep(1)} onSkip={() => setStep(1)} />
      )}
      {step === 1 && (
        <BankStep memberId={activeMemberId} onNext={() => setStep(2)} onSkip={() => setStep(2)} />
      )}
      {step === 2 && (
        <AssistantStep
          memberId={activeMemberId}
          onNext={() => setStep(3)}
          onSkip={() => setStep(3)}
        />
      )}
      {step === 3 && <AlertsStep memberId={activeMemberId} onFinish={finish} onSkip={finish} />}
    </div>
  );
}

function PinStep({
  memberId,
  onNext,
  onSkip,
}: {
  memberId: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [pin, setPin] = useState("");
  const setPinMutation = useMutation(
    orpc.caretaker.members.setPin.mutationOptions({
      onSuccess: () => {
        toast.success("PIN set");
        onNext();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const isValid = /^\d{4}$/.test(pin);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set the phone PIN</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Your assistant asks for this 4-digit PIN over the phone before discussing anything — it's
          how it confirms it's really talking to your nester. Pick something they'll remember, or
          skip this and a random one gets set instead.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-pin">4-digit PIN</Label>
          <div className="relative">
            <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              id="onboarding-pin"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-11 pl-9 text-lg tracking-[0.5em]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip this step
          </Button>
          <Button
            disabled={!isValid || setPinMutation.isPending}
            onClick={() => setPinMutation.mutate({ memberId, pin })}
          >
            {setPinMutation.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
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
          Demo Bank is the only one that actually connects — it backfills real Plaid Sandbox history
          so there&apos;s something to look at right away.
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
            <Button
              disabled={connectDemo.isPending}
              onClick={() => connectDemo.mutate({ memberId })}
            >
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
          <span className="text-muted-foreground text-xs uppercase">Trusted contact</span>
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
              Once a week briefing{" "}
              <span className="text-muted-foreground text-xs">(coming soon)</span>
            </p>
            <p className="text-muted-foreground text-xs">
              A weekly summary instead of one-off calls.
            </p>
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
