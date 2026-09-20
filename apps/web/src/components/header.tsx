import { Link } from "@tanstack/react-router";

import { Logo } from "./logo";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-lg font-bold tracking-tight">NestEgg</span>
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
