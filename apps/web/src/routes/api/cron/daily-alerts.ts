import * as alerts from "@steelhacks-2026/api/services/alerts";
import { createFileRoute } from "@tanstack/react-router";

import { rejectUnauthorizedCron } from "../../../lib/cron-auth";
import { elevenLabsConfig } from "../../../lib/elevenlabs";
import { bankProvider, db } from "../../../services";

// Evaluates every member and places the calls they're due.
async function handle({ request }: { request: Request }) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const started = Date.now();
  const results = await alerts.dispatchAll(db, {
    elevenLabs: elevenLabsConfig(),
    bankProvider,
  });
  const placed = results.reduce((sum, r) => sum + r.placed, 0);
  console.log(`[cron] daily-alerts: ${placed} call(s) across ${results.length} member(s)`);

  return Response.json({ members: results.length, placed, ms: Date.now() - started, results });
}

export const Route = createFileRoute("/api/cron/daily-alerts")({
  server: { handlers: { GET: handle, POST: handle } },
});
