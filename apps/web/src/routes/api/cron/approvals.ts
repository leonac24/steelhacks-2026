import { processTimeouts } from "@steelhacks-2026/api/services/change-requests";
import { createFileRoute } from "@tanstack/react-router";

import { requireCronSecret } from "../../../lib/voice";
import { db } from "../../../services";

async function handle(request: Request): Promise<Response> {
  const auth = requireCronSecret(request);
  if (auth) return auth;

  const result = await processTimeouts(db);
  return Response.json(result);
}

export const Route = createFileRoute("/api/cron/approvals")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});