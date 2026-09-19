import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { caretakerRouter } from "./caretaker";
import { devRouter } from "./dev";
import { memberRouter } from "./member";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  // TODO(milestone 5/6): drop once the web dashboard and native home stop using it.
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  caretaker: caretakerRouter,
  member: memberRouter,
  dev: devRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
