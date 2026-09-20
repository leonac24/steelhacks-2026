import { Card, Skeleton } from "heroui-native";
import { Text } from "react-native";

export function StatCard({
  label,
  value,
  hero = false,
}: {
  label: string;
  value: string | undefined;
  hero?: boolean;
}) {
  return (
    <Card variant="secondary" className="p-4">
      <Card.Description>{label}</Card.Description>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-24 rounded-lg" />
      ) : (
        <Text
          className={
            hero
              ? "mt-1 text-3xl font-semibold tracking-tight text-accent"
              : "mt-1 text-2xl font-semibold tracking-tight text-foreground"
          }
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
      )}
    </Card>
  );
}
