import type { Database } from "@steelhacks-2026/db";
import {
  getSessionByConversationId,
  verifySessionPin,
  type MemberRow,
} from "@steelhacks-2026/api/services/call-sessions";
import {
  checkAffordability,
  checkAffordabilityInput,
  confirmChange,
  confirmChangeInput,
  flagTransaction,
  flagTransactionInput,
  flattenZodMessage,
  getBalance,
  getBudgets,
  getRecentTransactions,
  getRecentTransactionsInput,
  getUpcomingBills,
  proposeChange,
  proposeChangeInput,
} from "@steelhacks-2026/api/services/voice-tools";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { requireToolSecret } from "../../../../lib/voice";
import { db } from "../../../../services";

// Every tool except verify_pin is gated on session.verified, checked here (and
// again implicitly, since member/data come from the session row).
const REQUIRES_VERIFIED: Record<string, boolean> = {
  verify_pin: false,
  get_balance: true,
  get_upcoming_bills: true,
  get_recent_transactions: true,
  check_affordability: true,
  get_budgets: true,
  propose_change: true,
  confirm_change: true,
  flag_transaction: true,
};

const conversationSchema = z.object({ conversation_id: z.string() });
const pinSchema = z.object({ pin: z.string().min(1) });

function toolResponse(obj: Record<string, unknown>): Response {
  return Response.json(obj);
}

async function runVerifyPin(db: Database, conversationId: string, body: unknown) {
  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Could you say your PIN again? I need the digits." };
  }
  const result = await verifySessionPin(db, { conversationId, pin: parsed.data.pin });
  if (result.ok) return { ok: true };
  switch (result.reason) {
    case "no_session":
      return { ok: false, error: "No active call session." };
    case "no_member":
      return { ok: false, error: "I couldn't find who's calling." };
    case "locked":
      return {
        ok: false,
        error:
          "Too many failed tries. For your safety I can't help on this call. Your family has been notified. Goodbye.",
      };
    case "wrong_pin":
      return { ok: false, error: `That PIN isn't right. You have ${result.attemptsRemaining} tries left.` };
  }
}

function parseOrError<T>(schema: z.ZodType<T>, body: unknown): { data: T } | { error: string } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: flattenZodMessage(parsed.error) };
  return { data: parsed.data };
}

export const Route = createFileRoute("/api/elevenlabs/tools/$tool")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = requireToolSecret(request);
        if (auth) return auth;

        const tool = params.tool;
        if (!(tool in REQUIRES_VERIFIED)) {
          return new Response("Not found", { status: 404 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return toolResponse({ ok: false, error: "Something went wrong on my end." });
        }

        const ids = conversationSchema.safeParse(body);
        if (!ids.success) {
          return toolResponse({ ok: false, error: "No active call session." });
        }

        const resolved = await getSessionByConversationId(db, ids.data.conversation_id);
        if (!resolved) {
          return toolResponse({ ok: false, error: "No active call session." });
        }
        const { session, member } = resolved;

        if (REQUIRES_VERIFIED[tool] && !session.verified) {
          return toolResponse({
            ok: false,
            error: "The member isn't verified yet — ask for their PIN and call verify_pin first.",
          });
        }

        const needsMember = tool !== "verify_pin";
        if (needsMember && !member) {
          return toolResponse({ ok: false, error: "I couldn't find who's calling." });
        }
        const m = member as MemberRow;

        try {
          switch (tool) {
            case "verify_pin":
              return toolResponse(await runVerifyPin(db, ids.data.conversation_id, body));
            case "get_balance":
              return toolResponse(await getBalance(db, m));
            case "get_upcoming_bills":
              return toolResponse(await getUpcomingBills(db, m));
            case "get_recent_transactions": {
              const parsed = parseOrError(getRecentTransactionsInput, body);
              if ("error" in parsed) return toolResponse({ ok: false, error: parsed.error });
              return toolResponse(await getRecentTransactions(db, m, parsed.data));
            }
            case "check_affordability": {
              const parsed = parseOrError(checkAffordabilityInput, body);
              if ("error" in parsed) return toolResponse({ ok: false, error: parsed.error });
              return toolResponse(await checkAffordability(db, m, parsed.data));
            }
            case "get_budgets":
              return toolResponse(await getBudgets(db, m));
            case "propose_change": {
              const parsed = parseOrError(proposeChangeInput, body);
              if ("error" in parsed) return toolResponse({ ok: false, error: parsed.error });
              return toolResponse(await proposeChange(db, m, session, parsed.data));
            }
            case "confirm_change": {
              const parsed = parseOrError(confirmChangeInput, body);
              if ("error" in parsed) return toolResponse({ ok: false, error: parsed.error });
              return toolResponse(await confirmChange(db, session, parsed.data));
            }
            case "flag_transaction": {
              const parsed = parseOrError(flagTransactionInput, body);
              if ("error" in parsed) return toolResponse({ ok: false, error: parsed.error });
              return toolResponse(await flagTransaction(db, m, parsed.data));
            }
            default:
              return new Response("Not found", { status: 404 });
          }
        } catch (error) {
          console.error(`[voice-tool:${tool}]`, error);
          return toolResponse({ ok: false, error: "Something went wrong on my end." });
        }
      },
    },
  },
});