import { Button } from "@steelhacks-2026/ui/components/button";
import { Link, useRouterState } from "@tanstack/react-router";

import UserMenu from "./user-menu";

const CARETAKER_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/demo", label: "Demo" },
] as const;

export default function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // The senior interface gets its own chrome: large text, one way back, nothing else.
  if (pathname.startsWith("/simple")) {
    return (
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
        <span className="text-2xl font-semibold">Your money</span>
        <Button variant="outline" render={<Link to="/dashboard" />} className="h-12 px-5 text-base">
          Caretaker view
        </Button>
      </header>
    );
  }

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
          <Button variant="outline" size="sm" render={<Link to="/simple" />}>
            Senior view
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
