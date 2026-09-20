import { ENV } from "../env.server";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Returns a 401
// response when the caller isn't allowed, or null when it is.
export function rejectUnauthorizedCron(request: Request): Response | null {
  const secret = ENV.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
