// Places proactive outbound calls through the ElevenLabs Agents Platform.
// `PlaceCallFn` is injected everywhere else so tests and dev runs never dial
// anyone by accident.
export type ElevenLabsCallEnv = {
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_AGENT_ID: string;
  ELEVENLABS_PHONE_NUMBER_ID: string;
};

export type PlaceCallFn = (input: {
  toNumber: string;
  dynamicVariables: Record<string, string>;
  firstMessage: string;
  // Which ElevenLabs voice reads the call, e.g. from ASSISTANT_VOICE_IDS.
  // Falls back to the agent's own configured voice when omitted.
  voiceId?: string;
}) => Promise<{ conversationId: string | null; callSid: string | null }>;

const OUTBOUND_URL = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";

export function createElevenLabsPlaceCall(env: ElevenLabsCallEnv): PlaceCallFn {
  return async ({ toNumber, dynamicVariables, firstMessage, voiceId }) => {
    const response = await fetch(OUTBOUND_URL, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agent_id: env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: env.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: toNumber,
        conversation_initiation_client_data: {
          dynamic_variables: dynamicVariables,
          conversation_config_override: {
            agent: { first_message: firstMessage },
            ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs outbound call failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as {
      success?: boolean;
      conversation_id?: string | null;
      callSid?: string | null;
    };
    return { conversationId: data.conversation_id ?? null, callSid: data.callSid ?? null };
  };
}