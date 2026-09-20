import { Button } from "@steelhacks-2026/ui/components/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

// TODO: real auth. For the demo there's one caretaker account (seeded by
// scripts/seed.ts); skip the credential form and sign straight in as them.
const DEMO_EMAIL = "maria@demo.dev";
const DEMO_PASSWORD = "demo-password-123";

function RouteComponent() {
  const navigate = useNavigate();
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function signIn() {
    setIsSigningIn(true);
    await authClient.signIn.email(
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      {
        onSuccess: () => void navigate({ to: "/dashboard" }),
        onError: (error) => {
          setIsSigningIn(false);
          toast.error(error.error.message || error.error.statusText);
        },
      },
    );
  }

  return (
    <div className="mx-auto mt-24 flex w-full max-w-sm flex-col items-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Caretaker demo</h1>
      <p className="text-muted-foreground text-sm">Signs you in as Maria, Dot&apos;s caretaker.</p>
      <Button className="w-full" onClick={signIn} disabled={isSigningIn}>
        {isSigningIn ? "Signing in..." : "Sign In"}
      </Button>
    </div>
  );
}
