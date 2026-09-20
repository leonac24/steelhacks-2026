import type { Context as ApiContext } from "@steelhacks-2026/api/context";

import { ENV } from "./env.server";
import { auth, createSandboxItem, db, injectPlaidTransaction } from "./services";

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    session,
    bankProvider: ENV.BANK_PROVIDER,
    devToolsEnabled: ENV.NODE_ENV !== "production" || ENV.DEV_TOOLS_ENABLED === true,
    createSandboxPlaidItem: createSandboxItem,
    injectPlaidTransaction,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;