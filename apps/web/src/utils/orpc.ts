import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { appRouter } from "@steelhacks-2026/api/routers/index";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { toast } from "sonner";

import { createContext } from "../context";

// Retrying an UNAUTHORIZED request never helps — the session is gone, not
// flaky — so instead of the generic "retry" toast, send the user to sign
// back in. Guarded so five simultaneous 401s don't fire five redirects.
let redirectingToLogin = false;

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "UNAUTHORIZED"
  );
}

function handleQueryError(error: Error, retry: () => void) {
  if (isUnauthorized(error)) {
    if (redirectingToLogin || typeof window === "undefined") return;
    redirectingToLogin = true;
    toast.error("Your session expired — please sign in again.");
    window.location.assign("/login");
    return;
  }
  toast.error(`Error: ${error.message}`, {
    action: { label: "retry", onClick: retry },
  });
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => handleQueryError(error, () => query.invalidate()),
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        // Mutation call sites mostly show their own toast already; only step
        // in for the case a generic handler can't — an expired session.
        if (isUnauthorized(error)) handleQueryError(error, () => {});
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(appRouter, {
      context: async () => {
        return createContext({ req: getRequest() });
      },
    }),
  )
  .client((): RouterClient<typeof appRouter> => {
    const link = new RPCLink({
      url: `${window.location.origin}/api/rpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    });

    return createORPCClient(link);
  });

export const client: RouterClient<typeof appRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
