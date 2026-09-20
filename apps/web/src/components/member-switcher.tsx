import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@steelhacks-2026/ui/components/select";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";

import { useActiveMember } from "@/hooks/use-active-member";

export function MemberSwitcher() {
  const { members, activeMemberId, isLoading, setActiveMemberId } = useActiveMember();

  if (isLoading) return <Skeleton className="h-9 w-40" />;
  if (members.length === 0) return null;

  // Nothing to switch between; show a plain label instead of a picker.
  if (members.length === 1) {
    return <span className="text-sm font-medium">{members[0]?.preferredName}</span>;
  }

  return (
    <Select
      value={activeMemberId}
      onValueChange={(value) => {
        if (value) setActiveMemberId(value);
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue placeholder="Choose a member" />
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.preferredName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
