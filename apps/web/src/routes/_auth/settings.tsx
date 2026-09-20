// Everything the onboarding wizard sets up once (PIN, assistant voice,
// alert preferences), editable any time after the fact.
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Checkbox } from "@steelhacks-2026/ui/components/checkbox";
import { Input } from "@steelhacks-2026/ui/components/input";
import { Label } from "@steelhacks-2026/ui/components/label";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Volume2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useActiveMember } from "@/hooks/use-active-member";
import { ALERT_ROWS, ASSISTANTS, type AlertType, type AssistantId } from "@/lib/assistant";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  const { activeMember, activeMemberId, isLoading } = useActiveMember();

  if (isLoading || !activeMemberId) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Everything from {activeMember?.preferredName ?? "this nester"}&apos;s onboarding — change
          it any time.
        </p>
      </div>

      <PinCard memberId={activeMemberId} />
      <AssistantCard memberId={activeMemberId} />
      <AlertsCard memberId={activeMemberId} />
    </div>
  );
}

function PinCard({ memberId }: { memberId: string }) {
  const [pin, setPin] = useState("");
  const setPinMutation = useMutation(
    orpc.caretaker.members.setPin.mutationOptions({
      onSuccess: () => {
        toast.success("PIN updated");
        setPin("");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const isValid = /^\d{4}$/.test(pin);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone PIN</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          The 4-digit PIN your assistant asks for before discussing anything over the phone. For
          security, the current one can&apos;t be shown here — only replaced.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="settings-pin">New 4-digit PIN</Label>
            <div className="relative">
              <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="settings-pin"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-11 pl-9 text-lg tracking-[0.5em]"
              />
            </div>
          </div>
          <Button
            disabled={!isValid || setPinMutation.isPending}
            onClick={() => setPinMutation.mutate({ memberId, pin })}
          >
            {setPinMutation.isPending ? "Saving…" : "Update PIN"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssistantCard({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(orpc.caretaker.settings.get.queryOptions({ input: { memberId } }));
  const [selected, setSelected] = useState<AssistantId | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Seed local selection from the saved value once it loads, without
  // clobbering the steward's in-progress pick on every background refetch.
  useEffect(() => {
    const saved = settingsQuery.data?.assistantName;
    if (saved === "Jay" || saved === "Robin") {
      setSelected((prev) => prev ?? saved);
    }
  }, [settingsQuery.data?.assistantName]);

  const updateSettings = useMutation(
    orpc.caretaker.settings.update.mutationOptions({
      onSuccess: () => {
        toast.success(`${selected} is your assistant now`);
        void queryClient.invalidateQueries({
          queryKey: orpc.caretaker.settings.get.queryKey({ input: { memberId } }),
        });
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

  const savedAssistant = settingsQuery.data?.assistantName;
  const isDirty = selected !== null && selected !== savedAssistant;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assistant voice</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {settingsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
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
        )}

        <Button
          className="self-end"
          disabled={!isDirty || updateSettings.isPending}
          onClick={() => selected && updateSettings.mutate({ memberId, assistantName: selected })}
        >
          {updateSettings.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AlertsCard({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery(orpc.caretaker.alertRules.list.queryOptions({ input: { memberId } }));
  const updateAlertRule = useMutation(
    orpc.caretaker.alertRules.update.mutationOptions({
      onSuccess: () =>
        void queryClient.invalidateQueries({
          queryKey: orpc.caretaker.alertRules.list.queryKey({ input: { memberId } }),
        }),
      onError: (error) => toast.error(error.message),
    }),
  );

  const rules = rulesQuery.data ?? [];
  const ruleFor = (type: AlertType) => rules.find((r) => r.type === type);

  function toggle(type: AlertType, who: "steward" | "nester", checked: boolean) {
    const current = ruleFor(type);
    const notifySteward = who === "steward" ? checked : (current?.notifySteward ?? true);
    const notifyNester = who === "nester" ? checked : (current?.notifyNester ?? true);
    updateAlertRule.mutate({
      memberId,
      type,
      enabled: notifySteward || notifyNester,
      notifySteward,
      notifyNester,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts &amp; who&apos;s contacted</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rulesQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-3 text-sm">
            <span className="text-muted-foreground text-xs uppercase" />
            <span className="text-muted-foreground text-xs uppercase">Steward</span>
            <span className="text-muted-foreground text-xs uppercase">Nester</span>

            {ALERT_ROWS.map((row) => {
              const rule = ruleFor(row.type);
              return (
                <Fragment key={row.type}>
                  <div>
                    <p className="font-medium">{row.label}</p>
                    <p className="text-muted-foreground text-xs">{row.description}</p>
                  </div>
                  <Checkbox
                    checked={rule?.notifySteward ?? true}
                    onCheckedChange={(checked) => toggle(row.type, "steward", checked === true)}
                  />
                  <Checkbox
                    checked={rule?.notifyNester ?? true}
                    onCheckedChange={(checked) => toggle(row.type, "nester", checked === true)}
                  />
                </Fragment>
              );
            })}

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
        )}
      </CardContent>
    </Card>
  );
}
