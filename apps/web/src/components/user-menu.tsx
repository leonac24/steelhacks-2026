import { Avatar, AvatarFallback, AvatarImage } from "@steelhacks-2026/ui/components/avatar";
import { Badge } from "@steelhacks-2026/ui/components/badge";
import { Button } from "@steelhacks-2026/ui/components/button";
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
import { Link, useNavigate } from "@tanstack/react-router";
import { User } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export default function UserMenu({
  signInClassName,
  variant = "compact",
  hideSignedOutButton = false,
}: {
  signInClassName?: string;
  /** "compact": avatar dropdown (with sign out) for the hero/header.
   * "sidebar": a plain name + email row for the sidebar footer — sign out
   * lives as its own row next to this one there, not in a menu. */
  variant?: "compact" | "sidebar";
  /** Skip the "Sign In" button when signed out — for the sign-in page's own
   * navbar, where showing a link to itself is just noise. */
  hideSignedOutButton?: boolean;
}) {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className={variant === "sidebar" ? "h-11 w-full" : "h-9 w-24"} />;
  }

  if (!session) {
    if (hideSignedOutButton) return null;
    return (
      <Link to="/login">
        <Button variant="outline" className={signInClassName}>
          Sign In
        </Button>
      </Link>
    );
  }

  const avatar = (
    <Avatar>
      {session.user.image && <AvatarImage src={session.user.image} alt={session.user.name} />}
      <AvatarFallback className="bg-accent text-accent-foreground">
        <User className="size-4" />
      </AvatarFallback>
    </Avatar>
  );

  if (variant === "sidebar") {
    return (
      <div className="flex w-full items-center gap-2 p-2">
        {avatar}
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{session.user.name}</p>
            <Badge className="bg-accent text-accent-foreground shrink-0">Steward</Badge>
          </div>
          <p className="text-sidebar-foreground/60 truncate text-xs">{session.user.email}</p>
        </div>
      </div>
    );
  }

  function signOut() {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate({ to: "/" }),
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account menu for ${session.user.name}`}
            className="rounded-full transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        {avatar}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{session.user.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={signOut}>
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
