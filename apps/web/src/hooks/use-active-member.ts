import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

// Which member the caretaker dashboard is currently looking at. Kept in the
// URL (?memberId=...) on the `_auth` layout route so it survives navigation
// between Dashboard/Budget/Transactions and is shareable/bookmarkable.
export function useActiveMember() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_auth" });
  const membersQuery = useQuery(orpc.caretaker.members.list.queryOptions());
  const members = membersQuery.data ?? [];

  const activeMemberId =
    search.memberId && members.some((m) => m.id === search.memberId)
      ? search.memberId
      : members[0]?.id;
  const activeMember = members.find((m) => m.id === activeMemberId) ?? null;

  function setActiveMemberId(memberId: string) {
    void navigate({ to: ".", search: (prev) => ({ ...prev, memberId }) });
  }

  return {
    members,
    activeMemberId,
    activeMember,
    isLoading: membersQuery.isLoading,
    setActiveMemberId,
  };
}
