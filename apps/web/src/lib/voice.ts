import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { ElevenLabsCallEnv } from "@steelhacks-2026/api/services/outbound-calls";

import { ENV } from "../env.server";

// Compare two strings in constant time (and constant work regardless of length
// mismatch) by comparing sha256 digests instead of the raw bytes.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// null = authorized. Otherwise returns the error Response to send.
export function requireToolSecret(request: Request): Response | null {
  const secret = ENV.ELEVENLABS_TOOL_SECRET;
  if (!secret) {
    return new Response("ELEVENLABS_TOOL_SECRET is not configured", { status: 500 });
  }
  const header = request.headers.get("x-voice-secret");
  if (!header || !safeEqual(header, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

export function requireCronSecret(request: Request): Response | null {
  const secret = ENV.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET is not configured", { status: 500 });
  }
  const header = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (!header || !safeEqual(header, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

// ElevenLabs post-call signature: `t=<unix_seconds>,v0=<hex>`, HMAC-SHA256 over
// `${t}.${rawBody}` with the webhook secret. Rejects stale timestamps (>30 min).
export function verifyElevenLabsSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSecs: number = Date.now() / 1000,
): boolean {
  if (!header) return false;

  const parts: Record<string, string> = {};
  for (const pair of header.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    parts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }

  const t = parts.t;
  const v0 = parts.v0;
  if (!t || !v0) return false;

  const ts = Number(t);
  if (!Number.isFinite(ts) || nowSecs - ts > 1800) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v0, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getElevenLabsEnv(): ElevenLabsCallEnv | null {
  const { ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID } = ENV;
  if (ELEVENLABS_API_KEY && ELEVENLABS_AGENT_ID && ELEVENLABS_PHONE_NUMBER_ID) {
    return { ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID };
  }
  return null;
}