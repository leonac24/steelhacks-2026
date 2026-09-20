import { Link } from "@tanstack/react-router";

import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import UserMenu from "./user-menu";

export default function Header({ hideSignIn = false }: { hideSignIn?: boolean } = {}) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-lg font-bold tracking-tight">NestEgg</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu hideSignedOutButton={hideSignIn} />
        </div>
      </div>
    </header>
  );
}
