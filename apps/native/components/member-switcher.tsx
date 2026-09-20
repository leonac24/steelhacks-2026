import { Ionicons } from "@expo/vector-icons";
import { Select, Skeleton, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";

import { useActiveMember } from "@/contexts/active-member-context";

// Native mirror of apps/web MemberSwitcher: nothing when there are no members,
// a plain label for one, a picker when the caretaker looks after several.
export function MemberSwitcher() {
  const { members, activeMemberId, isLoading, setActiveMemberId } = useActiveMember();
  const mutedColor = useThemeColor("muted");

  if (isLoading) return <Skeleton className="h-9 w-40 rounded-lg" />;
  if (members.length === 0) return null;

  if (members.length === 1) {
    return <Text className="text-sm font-medium text-foreground">{members[0]?.preferredName}</Text>;
  }

  const active = members.find((m) => m.id === activeMemberId);
  const value = active ? { value: active.id, label: active.preferredName } : undefined;

  return (
    <Select
      value={value}
      onValueChange={(option) => {
        const picked = Array.isArray(option) ? option[0] : option;
        if (picked) setActiveMemberId(picked.value);
      }}
    >
      <Select.Trigger variant="unstyled">
        <View className="flex-row items-center gap-1 rounded-lg border border-border px-2.5 py-1.5">
          <Ionicons name="people-outline" size={14} color={mutedColor} />
          <Text className="text-sm font-medium text-foreground">
            {active?.preferredName ?? "Member"}
          </Text>
          <Ionicons name="chevron-down" size={12} color={mutedColor} />
        </View>
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="bottom-sheet">
          <Select.ListLabel>Caretaking for</Select.ListLabel>
          {members.map((m) => (
            <Select.Item key={m.id} value={m.id} label={m.preferredName}>
              <Select.ItemLabel />
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
