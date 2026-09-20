import { Link, useMatches } from "@tanstack/react-router";

import { MemberSwitcher } from "./member-switcher";
import UserMenu from "./user-menu";

const CARETAKER_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/demo", label: "Demo" },
] as const;

export default function Header() {
  const isAuthed = useMatches().some((m) => m.routeId === "/_auth");

  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/budget", label: "Budget" },
    { to: "/transactions", label: "Transactions" },
    { to: "/bank", label: "Bank" },
    { to: "/notifications", label: "Notifications" },
    { to: "/todos", label: "Todos" },
  ] as const;

  return (
    <header className="border-b border-foreground/10">
      <div className="flex flex-row items-center justify-between gap-4 px-4 py-2">
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="font-semibold">
            Home
          </Link>
          {CARETAKER_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:underline data-[status=active]:underline-offset-4"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isAuthed && <MemberSwitcher />}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
