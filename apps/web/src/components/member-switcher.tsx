import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@steelhacks-2026/ui/components/dropdown-menu";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { Check, ChevronsUpDown } from "lucide-react";

import { useActiveMember } from "@/hooks/use-active-member";

// Dropdown next to the logo for switching which nester the trusted contact
// is looking at — same picker style whether they have one nester or several.
// The dropdown itself only names the nester; "'s NestEgg" sits outside it as
// plain text so the dropdown affordance stays just the name.
export function MemberSwitcher() {
  const { members, activeMemberId, activeMember, isLoading, setActiveMemberId } =
    useActiveMember();

  if (isLoading) return <Skeleton className="h-8 w-full" />;
  if (members.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-sidebar-accent"
            />
          }
        >
          <span className="truncate text-sm font-bold tracking-tight group-data-[collapsible=icon]:hidden">
            {activeMember?.preferredName ?? "Choose a nester"}
          </span>
          <ChevronsUpDown className="text-sidebar-foreground/60 size-3.5 shrink-0 group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-card w-56" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Your nesters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {members.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onClick={() => setActiveMemberId(m.id)}
                className="flex items-center justify-between gap-2"
              >
                {m.preferredName}
                {m.id === activeMemberId && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {activeMember && (
        <span className="text-sidebar-foreground/70 truncate text-sm group-data-[collapsible=icon]:hidden">
          &apos;s NestEgg
        </span>
      )}
    </div>
  );
}
