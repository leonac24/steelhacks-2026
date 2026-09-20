import { Badge } from "@steelhacks-2026/ui/components/badge";
import { Button } from "@steelhacks-2026/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@steelhacks-2026/ui/components/card";
import { Label } from "@steelhacks-2026/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@steelhacks-2026/ui/components/select";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sunrise } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { formatIsoDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const FREQUENCY_LABELS = {
  daily: "Every morning",
  weekly: "Every week",
} as const;

const frequencySchema = z.enum(["daily", "weekly"]);

export function FinancialWeatherPanel({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();

  const weather = useQuery(
    orpc.caretaker.notifications.weather.queryOptions({ input: { memberId } }),
  );
  const settings = useQuery(orpc.caretaker.settings.get.queryOptions({ input: { memberId } }));

  const updateFrequency = useMutation(
    orpc.caretaker.settings.update.mutationOptions({
      onSuccess: () => {
        toast.success("Weather briefing schedule updated.");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deliverNow = useMutation(
    orpc.dev.runBriefing.mutationOptions({
      onSuccess: (result) => {
        if (result.placed) {
          toast.success("June is calling with the briefing.");
        } else {
          toast.info(`Not delivered: ${result.skipped?.reason ?? "unknown"}`);
        }
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: orpc.caretaker.notifications.weather.queryKey({ input: { memberId } }),
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.caretaker.settings.get.queryKey({ input: { memberId } }),
    });
  }

  const loading = weather.isLoading || settings.isLoading;
  const frequency = frequencySchema.safeParse(settings.data?.briefingFrequency).success
    ? (settings.data!.briefingFrequency as "daily" | "weekly")
    : "weekly";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sunrise className="size-5 text-amber-500" />
          Financial weather briefing
          {weather.data?.due && <Badge>due now</Badge>}
        </CardTitle>
        <CardDescription>
          A short, ambient morning update — no question needed. June reads it on a schedule instead
          of only calling when something&apos;s wrong.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && <Skeleton className="h-24 w-full" />}
        {!loading && weather.data && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-2">
                <Label>Deliver</Label>
                <Select
                  value={frequency}
                  onValueChange={(value) =>
                    updateFrequency.mutate({
                      memberId,
                      briefingFrequency: value as "daily" | "weekly",
                    })
                  }
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => deliverNow.mutate({ memberId })}
                disabled={deliverNow.isPending}
              >
                {deliverNow.isPending ? "Calling..." : "Deliver now"}
              </Button>
            </div>

            <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
              <p className="text-sm">{weather.data.spoken}</p>
            </div>

            <p className="text-muted-foreground text-sm">
              {weather.data.due
                ? "Due now — the next scheduled run delivers it."
                : weather.data.nextBriefingDate
                  ? `Next briefing: ${formatIsoDate(weather.data.nextBriefingDate)}`
                  : "No briefing scheduled yet."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
