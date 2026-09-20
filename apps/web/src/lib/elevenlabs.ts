import type { ElevenLabsCallEnv } from "@steelhacks-2026/api/services/outbound-calls";

import { ENV } from "../env.server";

// Undefined unless all three are set, so the alerts engine never dials
// without credentials.
export function elevenLabsConfig(): ElevenLabsCallEnv | undefined {
  const { ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID } = ENV;
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID || !ELEVENLABS_PHONE_NUMBER_ID) return undefined;
  return { ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID };
}