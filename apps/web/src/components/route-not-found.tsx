import { Button } from "@steelhacks-2026/ui/components/button";
import { Link } from "@tanstack/react-router";

export function RouteNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        That page doesn&apos;t exist, or you may have followed a stale link.
      </p>
      <Link to="/">
        <Button>Go home</Button>
      </Link>
    </div>
  );
}
