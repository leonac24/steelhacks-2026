import * as financialWeather from "@steelhacks-2026/api/services/financial-weather";
import { createFileRoute } from "@tanstack/react-router";

import { rejectUnauthorizedCron } from "../../../lib/cron-auth";
import { elevenLabsConfig } from "../../../lib/elevenlabs";
import { db } from "../../../services";

// Delivers each member's scheduled financial weather briefing (daily or
// weekly, per their settings) if they're allowed a call right now.
async function handle({ request }: { request: Request }) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const started = Date.now();
  const results = await financialWeather.dispatchBriefings(db, {
    elevenLabs: elevenLabsConfig(),
  });
  const placed = results.reduce((sum, r) => sum + (r.placed ? 1 : 0), 0);
  console.log(`[cron] daily-briefings: ${placed} briefing(s) across ${results.length} member(s)`);

  return Response.json({ members: results.length, placed, ms: Date.now() - started, results });
}

export const Route = createFileRoute("/api/cron/daily-briefings")({
  server: { handlers: { GET: handle, POST: handle } },
});
