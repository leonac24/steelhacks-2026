import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@steelhacks-2026/ui/components/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { formatCents, formatIsoDate } from "@/lib/format";

const config = {
  balanceCents: { label: "Balance", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function BalanceChart({ data }: { data: { date: string; balanceCents: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-balanceCents)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-balanceCents)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) => formatIsoDate(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={64}
          tickFormatter={(value: number) => formatCents(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatIsoDate(String(value), "long")}
              formatter={(value) => formatCents(Number(value))}
            />
          }
        />
        <Area
          dataKey="balanceCents"
          type="monotone"
          fill="url(#balanceFill)"
          stroke="var(--color-balanceCents)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
