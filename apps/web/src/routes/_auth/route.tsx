import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@steelhacks-2026/ui/components/sidebar";
import { Outlet, createFileRoute, redirect, useMatches, Link } from "@tanstack/react-router";
import {
  Bell,
  CheckSquare,
  LayoutDashboard,
  Landmark,
  PiggyBank,
  PlayCircle,
  Receipt,
} from "lucide-react";
import { z } from "zod";

import { MemberSwitcher } from "@/components/member-switcher";
import UserMenu from "@/components/user-menu";
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

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/bank", label: "Accounts", icon: Landmark },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/budget", label: "Budget", icon: PiggyBank },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/demo", label: "Demo", icon: PlayCircle },
] as const;

function AuthLayout() {
  const matches = useMatches();
  const activePath = matches[matches.length - 1]?.pathname ?? "";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              B
            </span>
            <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              Better Track
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      render={<Link to={to} />}
                      isActive={activePath.startsWith(to)}
                      tooltip={label}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
          </div>
          <div className="flex items-center gap-2">
            <MemberSwitcher />
            <UserMenu />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
