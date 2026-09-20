import { runAlertsForAllMembers } from "@steelhacks-2026/api/services/alerts";
import { createElevenLabsPlaceCall } from "@steelhacks-2026/api/services/outbound-calls";
import { createFileRoute } from "@tanstack/react-router";

import { getElevenLabsEnv, requireCronSecret } from "../../../lib/voice";
import { db } from "../../../services";

async function handle(request: Request): Promise<Response> {
  const auth = requireCronSecret(request);
  if (auth) return auth;

  const env = getElevenLabsEnv();
  if (!env) {
    return new Response(
      "ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID must be set",
      { status: 500 },
    );
  }

  const counts = await runAlertsForAllMembers(db, createElevenLabsPlaceCall(env));
  return Response.json(counts);
}

export const Route = createFileRoute("/api/cron/alerts")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});