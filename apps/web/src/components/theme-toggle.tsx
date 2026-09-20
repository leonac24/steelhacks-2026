import { Button } from "@steelhacks-2026/ui/components/button";
import { cn } from "@steelhacks-2026/ui/lib/utils";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";

// Standalone icon toggle for pages outside the authenticated sidebar (the
// hero and sign-in page navbars). The sidebar has its own labeled row.
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, mounted, toggleTheme } = useTheme();
  const isDark = mounted && theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      className={cn(className)}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
