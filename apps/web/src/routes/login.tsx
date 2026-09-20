import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import Header from "@/components/header";
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
    <div className="flex min-h-svh flex-col bg-background">
      <Header />
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Caretaker demo</CardTitle>
            <p className="text-muted-foreground text-sm">
              Signs you in as Maria, Dot&apos;s caretaker.
            </p>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={signIn} disabled={isSigningIn}>
              {isSigningIn ? "Signing in..." : "Sign In"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
