import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@steelhacks-2026/ui/components/sidebar";
import { createFileRoute, Link, Outlet, redirect, useMatches, useNavigate } from "@tanstack/react-router";
import {
  Armchair,
  Bell,
  CheckSquare,
  FlaskConical,
  LayoutDashboard,
  Landmark,
  LogOut,
  Moon,
  PiggyBank,
  Receipt,
  Sun,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { MemberSwitcher } from "@/components/member-switcher";
import UserMenu from "@/components/user-menu";
import { getUser } from "@/functions/get-user";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
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

// Grouped like the steward's mental model: an overview, then the finance
// tools, then the things that need a caretaker decision.
const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Finances",
    items: [
      { to: "/accounts", label: "Accounts", icon: Landmark },
      { to: "/transactions", label: "Transactions", icon: Receipt },
      { to: "/budget", label: "Budget", icon: PiggyBank },
    ],
  },
  {
    label: "Care",
    items: [
      { to: "/approvals", label: "Approvals", icon: CheckSquare },
      { to: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Demo",
    items: [{ to: "/bank", label: "Bank", icon: FlaskConical }],
  },
] as const;

function AuthLayout() {
  const matches = useMatches();
  const activePath = matches[matches.length - 1]?.pathname ?? "";

  // Nester mode (/simple) is the stripped-down senior view — no steward
  // chrome at all. It exits back to the dashboard via a button on the page
  // itself, not from a sidebar that isn't there.
  if (activePath.startsWith("/simple")) {
    return (
      <div className="min-h-svh bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-1 px-1 py-1">
            <Link to="/" className="shrink-0 px-1">
              <Logo size={24} />
            </Link>
            <MemberSwitcher />
            <SidebarTrigger className="shrink-0" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          {NAV_GROUPS.map((group, i) => (
            <SidebarGroup key={group.label ?? `group-${i}`}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {group.items.map(({ to, label, icon: Icon }) => (
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
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link to="/simple" />} tooltip="Enter nester mode">
                <Armchair />
                <span>Enter nester mode</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarSeparator />
          <UserMenu variant="sidebar" />
          <SidebarMenu>
            <SidebarMenuItem>
              <ThemeToggleButton />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SignOutButton />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ThemeToggleButton() {
  const { theme, mounted, toggleTheme } = useTheme();
  const isDark = mounted && theme === "dark";

  return (
    <SidebarMenuButton
      tooltip={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    >
      {isDark ? <Sun /> : <Moon />}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </SidebarMenuButton>
  );
}

function SignOutButton() {
  const navigate = useNavigate();

  return (
    <SidebarMenuButton
      tooltip="Sign out"
      onClick={() =>
        authClient.signOut({
          fetchOptions: { onSuccess: () => navigate({ to: "/" }) },
        })
      }
    >
      <LogOut />
      <span>Sign out</span>
    </SidebarMenuButton>
  );
}
