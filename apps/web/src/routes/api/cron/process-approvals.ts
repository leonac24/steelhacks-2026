import * as changeRequests from "@steelhacks-2026/api/services/change-requests";
import { createFileRoute } from "@tanstack/react-router";

import { rejectUnauthorizedCron } from "../../../lib/cron-auth";
import { db } from "../../../services";

// Settles approvals past their deadline and expires stale proposals.
async function handle({ request }: { request: Request }) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const result = await changeRequests.processTimeouts(db);
  console.log(
    `[cron] process-approvals: applied=${result.applied} expired=${result.expired} stale=${result.staleProposals}`,
  );
  return Response.json(result);
}

export const Route = createFileRoute("/api/cron/process-approvals")({
  server: { handlers: { GET: handle, POST: handle } },
});
