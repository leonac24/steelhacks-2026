import { View } from "react-native";

// Simple stand-in for the web's Progress primitive (packages/ui).
export function ProgressBar({ value, danger = false }: { value: number; danger?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-default">
      <View
        className={danger ? "h-full rounded-full bg-danger" : "h-full rounded-full bg-accent"}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}
