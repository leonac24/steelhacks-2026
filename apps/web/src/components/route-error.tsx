import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

// Catches anything that slips past normal error handling — a route loader
// throwing, a DB hiccup, an unhandled render error — and shows something a
// caretaker or nester can actually act on instead of a blank page or a raw
// stack trace. "Session issues" in particular (an expired cookie, a stale
// server) usually resolve with a reload, so that's the first thing offered.
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : "Something unexpected happened.";
  const looksLikeSessionIssue = /session|unauthorized|401/i.test(message);

  function tryAgain() {
    reset();
    void router.invalidate();
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="bg-destructive/10 text-destructive mb-2 flex size-12 items-center justify-center rounded-full">
            <AlertTriangle className="size-6" />
          </div>
          <CardTitle>{looksLikeSessionIssue ? "Your session hiccupped" : "Something went wrong"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground text-sm">
            {looksLikeSessionIssue
              ? "Signing in again usually fixes this."
              : "This is a demo build — a background hiccup can bubble up here. Trying again usually clears it."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={tryAgain}>
              Try again
            </Button>
            <Link to="/login">
              <Button>Sign in again</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
