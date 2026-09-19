import { ORPCError } from "@orpc/server";
import z from "zod";

import { protectedProcedure, requirePrimaryCaretaker } from "../../index";

// TODO(milestone 8): implement with the Plaid SDK (Sandbox).
// https://plaid.com/docs/api/link/#linktokencreate
// https://plaid.com/docs/api/items/#itempublic_tokenexchange
export const plaidRouter = {
  createLinkToken: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async (): Promise<{ linkToken: string }> => {
      throw new ORPCError("NOT_IMPLEMENTED", { message: "Plaid Link isn't set up yet" });
    }),

  // Stores the access token server-side only; the response never includes it.
  exchangePublicToken: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        publicToken: z.string().min(1),
        institutionName: z.string().optional(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async (): Promise<{ bankConnectionId: string; institutionName: string }> => {
      throw new ORPCError("NOT_IMPLEMENTED", { message: "Plaid Link isn't set up yet" });
    }),
};
