// Places the proactive call through ElevenLabs' Twilio integration.
// Docs: https://elevenlabs.io/docs/api-reference/twilio/outbound-call
import type { Database } from "@steelhacks-2026/db";
import { callSession, member } from "@steelhacks-2026/db/schema/index";
import { eq } from "drizzle-orm";

import type { AlertCandidate } from "./alert-rules";

const OUTBOUND_CALL_URL = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";

export type ElevenLabsConfig = {
  apiKey: string;
  agentId: string;
  agentPhoneNumberId: string;
};

export type MemberRow = typeof member.$inferSelect;

export type PlaceResult = {
  callSessionId: string;
  conversationId: string | null;
  twilioCallSid: string | null;
  // True when no ElevenLabs credentials are configured: we log the call we
  // would have placed instead of dialing. Keeps the demo usable without them.
  simulated: boolean;
};

type OutboundCallResponse = {
  success?: boolean;
  message?: string;
  conversation_id?: string | null;
  callSid?: string | null;
};

export async function place(
  db: Database,
  target: MemberRow,
  alert: AlertCandidate,
  config: ElevenLabsConfig | null,
  voiceSpeed?: number,
): Promise<PlaceResult> {
  const [session] = await db
    .insert(callSession)
    .values({ memberId: target.id, direction: "outbound", verified: false })
    .returning();
  if (!session) throw new Error("Failed to create call session");

  if (!config) {
    console.log(`[outbound-call] (simulated) ${target.phoneE164}: ${alert.spokenMessage}`);
    return {
      callSessionId: session.id,
      conversationId: null,
      twilioCallSid: null,
      simulated: true,
    };
  }

  const response = await fetch(OUTBOUND_CALL_URL, {
    method: "POST",
    headers: { "xi-api-key": config.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: config.agentId,
      agent_phone_number_id: config.agentPhoneNumberId,
      to_number: target.phoneE164,
      conversation_initiation_client_data: {
        dynamic_variables: {
          alert_type: alert.ruleType,
          alert_message_spoken: alert.spokenMessage,
          preferred_name: target.preferredName,
          call_session_id: session.id,
        },
        // TODO: confirm the tts override key against current docs before relying
        // on per-member voice speed; the call still works without it.
        ...(voiceSpeed ? { conversation_config_override: { tts: { speed: voiceSpeed } } } : {}),
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `ElevenLabs outbound call failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }

  const body = (await response.json()) as OutboundCallResponse;
  await db
    .update(callSession)
    .set({
      elevenlabsConversationId: body.conversation_id ?? null,
      twilioCallSid: body.callSid ?? null,
    })
    .where(eq(callSession.id, session.id));

  return {
    callSessionId: session.id,
    conversationId: body.conversation_id ?? null,
    twilioCallSid: body.callSid ?? null,
    simulated: false,
  };
}
