// Resolves which member the interfaces are showing. Both the caretaker
// dashboard and the senior view read from this so the toggle never switches
// to a different person.
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { orpc } from "@/utils/orpc";

import { useAppState } from "./app-state";

export function useActiveMember() {
  const { activeMemberId, setActiveMemberId } = useAppState();
  const members = useQuery(orpc.caretaker.members.list.queryOptions());

  const list = members.data ?? [];
  // A stored id from a previous session may no longer be ours.
  const resolved = list.find((m) => m.id === activeMemberId) ?? list[0] ?? null;

  useEffect(() => {
    if (resolved && resolved.id !== activeMemberId) setActiveMemberId(resolved.id);
  }, [resolved, activeMemberId, setActiveMemberId]);

  return {
    members: list,
    member: resolved,
    memberId: resolved?.id ?? null,
    isLoading: members.isLoading,
    error: members.error,
  };
}
