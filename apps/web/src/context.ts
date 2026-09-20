import type { Context as ApiContext } from "@steelhacks-2026/api/context";

import { ENV } from "./env.server";
import { elevenLabsConfig } from "./lib/elevenlabs";
import {
  auth,
  bankProvider as bankProviderInstance,
  createSandboxItem,
  createUser,
  db,
  injectPlaidTransaction,
} from "./services";

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    session,
    bankProvider: ENV.BANK_PROVIDER,
    bankProviderInstance,
    devToolsEnabled: ENV.NODE_ENV !== "production" || ENV.DEV_TOOLS_ENABLED === true,
    elevenLabs: elevenLabsConfig(),
    createSandboxPlaidItem: createSandboxItem,
    injectPlaidTransaction,
    createUser,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
