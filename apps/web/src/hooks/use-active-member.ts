import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAppState } from "@/lib/app-state";
import { orpc } from "@/utils/orpc";

// Which member (nester) every interface is currently showing — the
// caretaker dashboard, the sidebar switcher, and the senior view all read
// from this single source (localStorage-backed via useAppState) so switching
// nesters never falls out of sync between the steward tools and nester mode.
export function useActiveMember() {
  const { activeMemberId: storedId, setActiveMemberId } = useAppState();
  const membersQuery = useQuery(orpc.caretaker.members.list.queryOptions());
  const members = membersQuery.data ?? [];

  // A stored id from a previous session or a different steward may no
  // longer be ours; fall back to the first linked member.
  const activeMemberId = (storedId && members.some((m) => m.id === storedId) ? storedId : members[0]?.id) ?? undefined;
  const activeMember = members.find((m) => m.id === activeMemberId) ?? null;

  useEffect(() => {
    if (activeMemberId && activeMemberId !== storedId) setActiveMemberId(activeMemberId);
  }, [activeMemberId, storedId, setActiveMemberId]);

  return {
    members,
    activeMemberId,
    activeMember,
    isLoading: membersQuery.isLoading,
    setActiveMemberId,
  };
}
