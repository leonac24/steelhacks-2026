import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { requireCaretakerOf, requireSelfMember } from "./lib/authz";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// Base for middlewares that run after requireAuth.
const authed = os.$context<Context & { session: NonNullable<Context["session"]> }>();

// Use after `.input(...)` with a `memberId` field. Viewers may read.
export const requireCaretaker = authed.middleware(
  async ({ context, next }, input: { memberId: string }) => {
    const link = await requireCaretakerOf(context.db, context.session.user.id, input.memberId);
    return next({ context: { caretakerLink: link } });
  },
);

// Same, but only the primary caretaker may pass (writes and approvals).
export const requirePrimaryCaretaker = authed.middleware(
  async ({ context, next }, input: { memberId: string }) => {
    const link = await requireCaretakerOf(
      context.db,
      context.session.user.id,
      input.memberId,
      "primary",
    );
    return next({ context: { caretakerLink: link } });
  },
);

// For the member's own native app: resolves the signed-in user's member row.
export const memberProcedure = protectedProcedure.use(async ({ context, next }) => {
  const self = await requireSelfMember(context.db, context.session.user.id);
  return next({ context: { member: self } });
});

// Demo-only procedures; 404 unless dev tools are on.
export const devProcedure = protectedProcedure.use(async ({ context, next }) => {
  if (!context.devToolsEnabled) throw new ORPCError("NOT_FOUND");
  return next();
});
