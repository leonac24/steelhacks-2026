import { Link, useMatches } from "@tanstack/react-router";

import { MemberSwitcher } from "./member-switcher";
import UserMenu from "./user-menu";

export default function Header() {
  const isAuthed = useMatches().some((m) => m.routeId === "/_auth");

  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/budget", label: "Budget" },
    { to: "/transactions", label: "Transactions" },
    { to: "/bank", label: "Bank" },
    { to: "/todos", label: "Todos" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {isAuthed && <MemberSwitcher />}
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
}
