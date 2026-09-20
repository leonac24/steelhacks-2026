import { runAlertsForAllMembers } from "@steelhacks-2026/api/services/alerts";
import { createElevenLabsPlaceCall } from "@steelhacks-2026/api/services/outbound-calls";
import { createFileRoute } from "@tanstack/react-router";

import { rejectUnauthorizedCron } from "../../../lib/cron-auth";
import { elevenLabsConfig } from "../../../lib/elevenlabs";
import { db } from "../../../services";

// Evaluates every member and places the calls they're due.
async function handle({ request }: { request: Request }) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const env = elevenLabsConfig();
  if (!env) {
    return new Response(
      "ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID must be set",
      { status: 500 },
    );
  }

  const started = Date.now();
  const results = await runAlertsForAllMembers(db, createElevenLabsPlaceCall(env));
  const placed = Object.values(results).reduce((sum, r) => sum + r.placed, 0);
  console.log(`[cron] daily-alerts: ${placed} call(s) across ${Object.keys(results).length} member(s)`);

  return Response.json({
    members: Object.keys(results).length,
    placed,
    ms: Date.now() - started,
    results,
  });
}

export const Route = createFileRoute("/api/cron/daily-alerts")({
  server: { handlers: { GET: handle, POST: handle } },
});