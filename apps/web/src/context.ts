import type { Context as ApiContext } from "@steelhacks-2026/api/context";

import { auth, bankProvider, createSandboxItem, db, injectPlaidTransaction } from "./services";

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    session,
    bankProvider,
    createSandboxPlaidItem: createSandboxItem,
    injectPlaidTransaction,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
