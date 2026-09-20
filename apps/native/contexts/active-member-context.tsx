import { useQuery } from "@tanstack/react-query";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { client, orpc } from "@/utils/orpc";

export type Member = Awaited<ReturnType<typeof client.caretaker.members.list>>[number];

type ActiveMemberContextValue = {
  members: Member[];
  activeMemberId: string | undefined;
  activeMember: Member | null;
  isLoading: boolean;
  setActiveMemberId: (memberId: string) => void;
};

const ActiveMemberContext = createContext<ActiveMemberContextValue | undefined>(undefined);

// Which member the caretaker UI is currently looking at. Mirrors the web's
// ?memberId= URL search param (apps/web/src/hooks/use-active-member.ts) with
// in-memory state, since native screens have no shareable URL to keep it in.
export function ActiveMemberProvider({ children }: { children: React.ReactNode }) {
  const membersQuery = useQuery(orpc.caretaker.members.list.queryOptions());
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // A stored id from a previous session may no longer be ours.
  const activeMember = members.find((m) => m.id === selectedId) ?? members[0] ?? null;

  useEffect(() => {
    if (activeMember && activeMember.id !== selectedId) setSelectedId(activeMember.id);
  }, [activeMember, selectedId]);

  const value = useMemo<ActiveMemberContextValue>(
    () => ({
      members,
      activeMemberId: activeMember?.id,
      activeMember,
      isLoading: membersQuery.isLoading,
      setActiveMemberId: setSelectedId,
    }),
    [members, activeMember, membersQuery.isLoading],
  );

  return <ActiveMemberContext.Provider value={value}>{children}</ActiveMemberContext.Provider>;
}

export function useActiveMember() {
  const context = useContext(ActiveMemberContext);
  if (!context) {
    throw new Error("useActiveMember must be used within ActiveMemberProvider");
  }
  return context;
}
