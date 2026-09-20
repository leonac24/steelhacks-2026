import { useThemeColor } from "heroui-native";
import { Text, View } from "react-native";

import { formatCents } from "@/lib/format";

type BalancePoint = { date: string; balanceCents: number };

// Lightweight View-based bar chart; the web uses recharts, which has no native
// equivalent installed, so this renders the same 30-day balance series as bars.
export function BalanceChart({ data }: { data: BalancePoint[] }) {
  const accentColor = useThemeColor("accent");

  if (data.length === 0) {
    return <Text className="text-muted text-sm">No balance history yet.</Text>;
  }

  const values = data.map((d) => d.balanceCents);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);

  return (
    <View className="gap-2">
      <View className="h-40 flex-row items-end gap-[2px]">
        {data.map((point) => {
          const ratio = (point.balanceCents - min) / span;
          return (
            <View
              key={point.date}
              className="flex-1 rounded-sm"
              style={{
                height: `${8 + ratio * 92}%`,
                backgroundColor: accentColor,
                opacity: 0.35 + ratio * 0.65,
              }}
            />
          );
        })}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-muted text-xs">{formatCents(min)}</Text>
        <Text className="text-muted text-xs">{formatCents(max)}</Text>
      </View>
    </View>
  );
}
