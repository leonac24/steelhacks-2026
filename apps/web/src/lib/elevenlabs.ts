import type { ElevenLabsConfig } from "@steelhacks-2026/api/services/outbound-calls";

import { ENV } from "../env.server";

// Null unless all three are set, so the alerts engine falls back to logging.
export function elevenLabsConfig(): ElevenLabsConfig | null {
  const apiKey = ENV.ELEVENLABS_API_KEY;
  const agentId = ENV.ELEVENLABS_AGENT_ID;
  const agentPhoneNumberId = ENV.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
  if (!apiKey || !agentId || !agentPhoneNumberId) return null;
  return { apiKey, agentId, agentPhoneNumberId };
}
