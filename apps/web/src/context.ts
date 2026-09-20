import type { Context as ApiContext } from "@steelhacks-2026/api/context";

import { ENV } from "./env.server";
import { auth, createSandboxItem, createUser, db, injectPlaidTransaction } from "./services";

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    session,
    bankProvider: ENV.BANK_PROVIDER,
    devToolsEnabled: ENV.NODE_ENV !== "production" || ENV.DEV_TOOLS_ENABLED === true,
    elevenLabsEnv:
      ENV.ELEVENLABS_API_KEY && ENV.ELEVENLABS_AGENT_ID && ENV.ELEVENLABS_PHONE_NUMBER_ID
        ? {
            ELEVENLABS_API_KEY: ENV.ELEVENLABS_API_KEY,
            ELEVENLABS_AGENT_ID: ENV.ELEVENLABS_AGENT_ID,
            ELEVENLABS_PHONE_NUMBER_ID: ENV.ELEVENLABS_PHONE_NUMBER_ID,
          }
        : undefined,
    createSandboxPlaidItem: createSandboxItem,
    injectPlaidTransaction,
    createUser,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
