import { Badge } from "@steelhacks-2026/ui/components/badge";
import { Button } from "@steelhacks-2026/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import Header from "@/components/header";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Badge variant="secondary" className="mb-4">
          <span
            className={`mr-1 size-1.5 rounded-full ${healthCheck.data ? "bg-emerald-500" : "bg-destructive"}`}
          />
          {healthCheck.isLoading ? "Checking API…" : healthCheck.data ? "API connected" : "API offline"}
        </Badge>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Help the people you care about manage money with confidence.
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Better Track pairs a caretaker dashboard with a friendly voice assistant, so seniors can
          check in on their finances just by picking up the phone.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link to="/dashboard">
            <Button size="lg">Go to dashboard</Button>
          </Link>
          <Link to="/simple">
            <Button size="lg" variant="outline">
              Senior view
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
