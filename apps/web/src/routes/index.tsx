import { Button } from "@steelhacks-2026/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, ShieldCheck, Smartphone, Wallet } from "lucide-react";

import { HeroBackground } from "@/components/hero-background";
import UserMenu from "@/components/user-menu";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const FEATURES = [
  { icon: Mic, label: "Voice check-ins" },
  { icon: Wallet, label: "Family budgets" },
  { icon: ShieldCheck, label: "Fraud alerts" },
  { icon: Smartphone, label: "No app for seniors" },
] as const;

function HomeComponent() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-[#3d2a3a]">
      <HeroBackground />

      <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/nestegg-static.png" alt="" className="size-7" />
          <span className="text-base font-bold tracking-tight text-white">NestEgg</span>
        </Link>
        <div className="flex items-center gap-4">
          <UserMenu signInClassName="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium tracking-wide text-white/90 uppercase backdrop-blur-sm">
          <span
            className={`size-1.5 rounded-full ${healthCheck.data ? "bg-emerald-400" : "bg-destructive"}`}
          />
          {healthCheck.isLoading
            ? "Checking status…"
            : healthCheck.data
              ? "NestEgg is live"
              : "Reconnecting…"}
        </span>

        <h1 className="font-display max-w-4xl text-5xl leading-[1.1] font-medium text-balance text-white sm:text-6xl lg:text-7xl">
          The Nest is Empty. The Egg isn&apos;t.
        </h1>

        <p className="mt-6 max-w-lg text-base text-white/70 sm:text-lg">
          You moved out, but their money didn&apos;t move on. NestEgg helps you build a budget for
          your family, and checks in by voice, so nobody has to open an app or start a hard
          conversation.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link to="/dashboard">
            <Button size="lg" className="bg-white text-neutral-900 hover:bg-white/90">
              Go to dashboard
            </Button>
          </Link>
          <Link to="/simple">
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Senior view
            </Button>
          </Link>
        </div>
      </main>

      <div className="relative z-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6 pb-10">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-sm font-medium text-white/70">
            <Icon className="size-4" />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
