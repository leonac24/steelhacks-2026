import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/_auth")({
  validateSearch: z.object({ memberId: z.string().optional() }),
  component: AuthLayout,
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
      });
    }
  },
});

function AuthLayout() {
  return (
    <div className="p-4">
      <Outlet />
    </div>
  );
}
