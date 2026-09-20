import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Checkbox } from "@steelhacks-2026/ui/components/checkbox";
import { Input } from "@steelhacks-2026/ui/components/input";
import { Label } from "@steelhacks-2026/ui/components/label";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Armchair, Info, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import Header from "@/components/header";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

// Demo-only shortcut (real accounts are seeded by scripts/seed.ts): the
// trusted contact form accepts any password for maria@example.com and signs in as
// Maria, the demo trusted contact. Nesters don't self-serve sign-in at all —
// their trusted contact signs in and toggles into nester mode for them.
const STEWARD_DEMO_EMAIL = "maria@example.com";
const STEWARD_CREDENTIALS = { email: "maria@demo.dev", password: "demo-password-123" };

type Mode = "steward" | "nester";

function RouteComponent() {
  const [mode, setMode] = useState<Mode>("steward");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header hideSignIn />
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <p className="text-muted-foreground text-sm">
              Are you managing care, or is this your account?
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              <ModeTab
                active={mode === "steward"}
                onClick={() => setMode("steward")}
                icon={Users}
                label="I'm a trusted contact"
              />
              <ModeTab
                active={mode === "nester"}
                onClick={() => setMode("nester")}
                icon={Armchair}
                label="I'm a nester"
              />
            </div>

            {mode === "steward" ? <StewardSignIn /> : <NesterSignIn />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

// Trusted contact: family managing a nester's finances. Real email +
// password form, with one demo shortcut: dot@example.com + any password.
// "Simulate new user" is a second shortcut for onboarding: instead of
// signing into the existing demo trusted contact, it mints a brand-new one with its
// own fresh nester, so a fresh account walkthrough can be demoed too.
function StewardSignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [simulateNewUser, setSimulateNewUser] = useState(false);
  const [connectDemoBank, setConnectDemoBank] = useState(true);
  const [phone, setPhone] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setIsSigningIn(true);

    if (simulateNewUser) {
      try {
        const result = await client.dev.simulateNewUser({ connectDemoBank, phone });
        await authClient.signIn.email(
          { email: result.email, password: result.password },
          {
            onSuccess: () => {
              void navigate({ to: "/onboarding" });
              toast.success(
                result.bankConnected
                  ? "New trusted contact created — Demo Bank connected"
                  : "New trusted contact created",
              );
            },
            onError: (error) => {
              setIsSigningIn(false);
              toast.error(error.error.message || error.error.statusText);
            },
          },
        );
      } catch (error) {
        setIsSigningIn(false);
        toast.error(error instanceof Error ? error.message : "Couldn't simulate a new user");
      }
      return;
    }

    const isDemoShortcut = email.trim().toLowerCase() === STEWARD_DEMO_EMAIL;
    const credentials = isDemoShortcut ? STEWARD_CREDENTIALS : { email, password };
    await authClient.signIn.email(credentials, {
      onSuccess: () => void navigate({ to: "/dashboard" }),
      onError: (error) => {
        setIsSigningIn(false);
        toast.error(error.error.message || error.error.statusText);
      },
    });
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="steward-email">Email</Label>
        <Input
          id="steward-email"
          type="email"
          autoComplete="email"
          required={!simulateNewUser}
          disabled={simulateNewUser}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="steward-password">Password</Label>
        <Input
          id="steward-password"
          type="password"
          autoComplete="current-password"
          required={!simulateNewUser}
          disabled={simulateNewUser}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={simulateNewUser}
            onCheckedChange={(checked) => setSimulateNewUser(checked === true)}
          />
          <span>
            Simulate new user
            <span className="text-muted-foreground block text-xs">
              Skip signing in — create a fresh trusted contact + nester to demo onboarding.
            </span>
          </span>
        </label>
        {simulateNewUser && (
          <div className="space-y-3 pl-6">
            <div className="space-y-1">
              <Label htmlFor="simulate-phone" className="text-xs">
                Your phone number
              </Label>
              <Input
                id="simulate-phone"
                type="tel"
                placeholder="+1 412 555 0142"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                So we can eventually give you a call as part of the demo.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={connectDemoBank}
                onCheckedChange={(checked) => setConnectDemoBank(checked === true)}
              />
              <span>
                Automatically connect Demo Bank
                <span className="text-muted-foreground block text-xs">
                  Backfills real Plaid Sandbox transaction history right away.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSigningIn}>
        {isSigningIn
          ? simulateNewUser
            ? "Creating…"
            : "Signing in..."
          : simulateNewUser
            ? "Create demo account"
            : "Sign In"}
      </Button>
      {!simulateNewUser && (
        <p className="text-muted-foreground text-center text-xs">
          Demo: <span className="font-mono">{STEWARD_DEMO_EMAIL}</span> with any password signs
          you in as the trusted contact.
        </p>
      )}
    </form>
  );
}

// Nester: the person being cared for. They don't sign in themselves — their
// trusted contact signs in and switches into nester mode for them from the sidebar.
function NesterSignIn() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <Info className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <p>Have your trusted contact log in and toggle your profile!</p>
    </div>
  );
}
