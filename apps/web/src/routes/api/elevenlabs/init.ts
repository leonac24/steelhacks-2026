import { startInboundSession } from "@steelhacks-2026/api/services/call-sessions";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { db } from "../../../services";

const initBody = z.object({
  caller_id: z.string(),
  agent_id: z.string(),
  called_number: z.string().optional(),
  call_sid: z.string().optional(),
  conversation_id: z.string(),
});

const UNKNOWN_CALLER_MESSAGE =
  "Hello, this is June. I'm sorry, but I don't recognize this phone number, and I can only talk with family members who are set up with me. Please ask your family to help set you up. Goodbye for now.";

export const Route = createFileRoute("/api/elevenlabs/init")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // No secret required here: this endpoint only registers a call session; it
        // never returns member data. Sensitive data stays behind verify_pin + the
        // authenticated tool webhooks. ElevenLabs's conversation-initiation webhook
        // doesn't forward custom headers, so a header check can't be satisfied.
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        const parsed = initBody.safeParse(body);
        if (!parsed.success) {
          return new Response("Invalid initiation payload", { status: 400 });
        }

        const { member } = await startInboundSession(db, {
          callerId: parsed.data.caller_id,
          conversationId: parsed.data.conversation_id,
          twilioCallSid: parsed.data.call_sid ?? null,
        });

        const identified = (member ? "yes" : "no") as "yes" | "no";
        const firstMessage = member
          ? `Hello ${member.preferredName}! This is June. Before we talk about your money, could you tell me your PIN?`
          : UNKNOWN_CALLER_MESSAGE;

        return Response.json({
          type: "conversation_initiation_client_data",
          dynamic_variables: {
            identified,
            member_preferred_name: member?.preferredName ?? "",
            call_direction: "inbound",
            call_reason: "member_inquiry",
            alert_detail: "",
          },
          conversation_config_override: { agent: { first_message: firstMessage } },
        });
      },
    },
  },
});
