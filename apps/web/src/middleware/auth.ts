import { createMiddleware } from "@tanstack/react-start";

import { auth } from "../services";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  let session = null;
  try {
    session = await auth.api.getSession({
      headers: request.headers,
    });
  } catch (error) {
    // A DB hiccup or a stale/corrupt session shouldn't crash the whole
    // request — treat it as signed-out and let the app redirect to login
    // like it would for anyone else without a session.
    console.error("authMiddleware: failed to resolve session", error);
  }
  return next({
    context: { session },
  });
});
