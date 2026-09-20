import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@steelhacks-2026/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { formatCents, formatIsoDate } from "@/lib/format";

const config = {
  spentCents: { label: "Spent", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function SpendingChart({ data }: { data: { date: string; spentCents: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
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
        <Bar dataKey="spentCents" fill="var(--color-spentCents)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
