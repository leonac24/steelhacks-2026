import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight">Better Track</span>
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
