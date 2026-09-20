import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import { Checkbox } from "@steelhacks-2026/ui/components/checkbox";
import { Input } from "@steelhacks-2026/ui/components/input";
import { Label } from "@steelhacks-2026/ui/components/label";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Armchair, FlaskConical, Info, Users } from "lucide-react";
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
// their trusted contact signs in and toggles into simplified view for them.
const STEWARD_DEMO_EMAIL = "maria@example.com";
const STEWARD_CREDENTIALS = { email: "maria@demo.dev", password: "demo-password-123" };

type Mode = "steward" | "nester";

// Mirrors the fake-name lists in packages/api/src/routers/dev.ts — kept as a
// separate small copy here (rather than importing that server-only router)
// since the beaker button just needs plausible names/ages for the form, not
// the actual random pick the server makes when a field is left blank.
const FAKE_STEWARD_NAMES = [
  "Priya Sharma",
  "Marcus Webb",
  "Sofia Marín",
  "Daniel Osei",
  "Grace Lindqvist",
] as const;
const FAKE_NESTER_NAMES = ["Eleanor Chen", "Walter Nguyen", "Rosa Delgado", "Harold Jackson"] as const;

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

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

type AuthTab = "signin" | "signup";

// Trusted contact: family managing a nester's finances. Two ordinary tabs —
// sign in (email + password, with a demo shortcut) and sign up (name, ages,
// nester info, phone). Sign up always goes through the dev.simulateNewUser
// shortcut under the hood, since there's no separate production registration
// flow yet, but it's presented as a normal signup form rather than gated
// behind a "simulate new user" checkbox.
function StewardSignIn() {
  const [authTab, setAuthTab] = useState<AuthTab>("signin");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setAuthTab("signin")}
          className={cn(
            "rounded-md py-1.5 font-medium transition-colors",
            authTab === "signin"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setAuthTab("signup")}
          className={cn(
            "rounded-md py-1.5 font-medium transition-colors",
            authTab === "signup"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Sign up
        </button>
      </div>
      {authTab === "signin" ? <StewardSignInForm /> : <StewardSignUpForm />}
    </div>
  );
}

function StewardSignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setIsSigningIn(true);
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
          required
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
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isSigningIn}>
        {isSigningIn ? "Signing in..." : "Sign In"}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        Demo: <span className="font-mono">{STEWARD_DEMO_EMAIL}</span> with any password signs you
        in as the trusted contact.
      </p>
    </form>
  );
}

function StewardSignUpForm() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [seedDemoBank, setSeedDemoBank] = useState(true);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [nesterName, setNesterName] = useState("");
  const [nesterAge, setNesterAge] = useState("");

  function fillRandomDemoNames() {
    setName(pickRandom(FAKE_STEWARD_NAMES));
    setAge(String(randomInt(35, 68)));
    setNesterName(pickRandom(FAKE_NESTER_NAMES));
    setNesterAge(String(randomInt(70, 92)));
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    try {
      const result = await client.dev.simulateNewUser({
        connectDemoBank: seedDemoBank,
        phone,
        name: name.trim() || undefined,
        age: age.trim() ? Number(age) : undefined,
        nesterName: nesterName.trim() || undefined,
        nesterAge: nesterAge.trim() ? Number(nesterAge) : undefined,
      });
      await authClient.signIn.email(
        { email: result.email, password: result.password },
        {
          onSuccess: () => {
            void navigate({ to: "/onboarding" });
            toast.success(
              result.bankConnected
                ? "Account created — Demo Bank connected"
                : "Account created",
            );
          },
          onError: (error) => {
            setIsCreating(false);
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    } catch (error) {
      setIsCreating(false);
      toast.error(error instanceof Error ? error.message : "Couldn't create an account");
    }
  }

  return (
    <form onSubmit={signUp} className="flex flex-col gap-4">
      <div className="space-y-1">
        <Label htmlFor="signup-name">Your name</Label>
        <div className="flex gap-2">
          <Input id="signup-name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Fill with random demo names"
            onClick={fillRandomDemoNames}
          >
            <FlaskConical className="size-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-age">Your age (optional)</Label>
        <Input
          id="signup-age"
          type="number"
          min={1}
          max={120}
          value={age}
          onChange={(e) => setAge(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-nester-name">Your nester's name</Label>
        <Input
          id="signup-nester-name"
          required
          value={nesterName}
          onChange={(e) => setNesterName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-nester-age">Your nester's age (optional)</Label>
        <Input
          id="signup-nester-age"
          type="number"
          min={1}
          max={120}
          value={nesterAge}
          onChange={(e) => setNesterAge(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-phone">Phone number</Label>
        <Input
          id="signup-phone"
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
          checked={seedDemoBank}
          onCheckedChange={(checked) => setSeedDemoBank(checked === true)}
        />
        <span>
          Seed
          <span className="text-muted-foreground block text-xs">
            Connects Demo Bank and backfills real Plaid Sandbox transaction history right away.
          </span>
        </span>
      </label>
      <Button type="submit" className="w-full" disabled={isCreating}>
        {isCreating ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}

// Nester: the person being cared for. They don't sign in themselves — their
// trusted contact signs in and switches into simplified view for them from the sidebar.
function NesterSignIn() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <Info className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <p>Have your trusted contact log in and toggle your profile!</p>
    </div>
  );
}
