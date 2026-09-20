import {
  getSessionByConversationId,
  recordPostCall,
} from "@steelhacks-2026/api/services/call-sessions";
import { RULE_LABELS } from "@steelhacks-2026/api/services/alerts";
import { notifyCaretakers } from "@steelhacks-2026/api/services/notify";
import { alertSent, memberSettings } from "@steelhacks-2026/db/schema/index";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import z from "zod";

import { ENV } from "../../../env.server";
import { verifyElevenLabsSignature } from "../../../lib/voice";
import { db } from "../../../services";

const transcriptEntry = z.object({
  role: z.string().optional(),
  message: z.string().nullable().optional(),
  time_in_call_secs: z.number().nullable().optional(),
});

const transcriptionData = z.looseObject({
  conversation_id: z.string().optional(),
  transcript: z.array(transcriptEntry).optional(),
  analysis: z.looseObject({ transcript_summary: z.string().nullable().optional() }).optional(),
});

const failureData = z.looseObject({
  conversation_id: z.string().optional(),
  failure_reason: z.string().optional(),
});

async function handleTranscription(data: unknown) {
  const parsed = transcriptionData.safeParse(data);
  if (!parsed.success || !parsed.data.conversation_id) return;

  const summaryText = parsed.data.analysis?.transcript_summary ?? null;
  const transcript = (parsed.data.transcript ?? []).map((t) => ({
    role: (t.role === "user" ? "user" : "agent") as "agent" | "user",
    message: t.message ?? null,
    timeInCallSecs: t.time_in_call_secs ?? null,
  }));

  const session = await recordPostCall(db, {
    conversationId: parsed.data.conversation_id,
    summaryText,
    transcript,
    endedAt: new Date(),
  });
  if (!session) return;

  // A placed alert whose call actually connected is now answered.
  await db
    .update(alertSent)
    .set({ status: "answered" })
    .where(and(eq(alertSent.callSessionId, session.id), eq(alertSent.status, "placed")));
}

async function handleFailure(data: unknown) {
  const parsed = failureData.safeParse(data);
  if (!parsed.success || !parsed.data.conversation_id) return;

  const resolved = await getSessionByConversationId(db, parsed.data.conversation_id);
  if (!resolved || !resolved.member) return;
  const { session, member } = resolved;

  const [alert] = await db
    .select()
    .from(alertSent)
    .where(eq(alertSent.callSessionId, session.id));

  const reason = parsed.data.failure_reason;
  const unanswered = reason === "busy" || reason === "no-answer";
  if (alert) {
    await db
      .update(alertSent)
      .set({ status: unanswered ? "unanswered" : "failed" })
      .where(eq(alertSent.id, alert.id));
  }

  const didNotAnswer = reason === "busy" || reason === "no-answer";
  if (didNotAnswer) {
    const settings = await db.query.memberSettings.findFirst({
      where: eq(memberSettings.memberId, member.id),
    });
    if (settings?.notifyCaretakerOnUnanswered) {
      const label = alert ? RULE_LABELS[alert.ruleType] : "an alert";
      await notifyCaretakers(
        db,
        member.id,
        `${member.preferredName} didn't answer Robin's call about ${label}.`,
      );
    }
  }
}

export const Route = createFileRoute("/api/elevenlabs/post-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const secret = ENV.ELEVENLABS_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("ELEVENLABS_WEBHOOK_SECRET is not configured", { status: 500 });
        }
        if (!verifyElevenLabsSignature(rawBody, request.headers.get("elevenlabs-signature"), secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          return new Response("OK", { status: 200 });
        }

        const obj = (parsed && typeof parsed === "object" ? parsed : {}) as {
          type?: unknown;
          data?: unknown;
        };
        if (obj.type === "post_call_transcription") {
          await handleTranscription(obj.data);
        } else if (obj.type === "call_initiation_failure") {
          await handleFailure(obj.data);
        }
        // Ignore everything else (post_call_audio, unknown events).

        return new Response("OK", { status: 200 });
      },
    },
  },
});