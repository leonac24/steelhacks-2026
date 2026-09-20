import type { Context as ApiContext } from "@steelhacks-2026/api/context";

import { ENV } from "./env.server";
import { elevenLabsConfig } from "./lib/elevenlabs";
import { auth, db } from "./services";

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    session,
    bankProvider: ENV.BANK_PROVIDER,
    devToolsEnabled: ENV.NODE_ENV !== "production" || ENV.DEV_TOOLS_ENABLED === true,
    elevenLabs: elevenLabsConfig(),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
