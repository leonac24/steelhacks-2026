import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "steelhacks.theme";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Night mode toggle. The actual class is set synchronously by an inline
// script in __root.tsx (before hydration, to avoid a flash of the wrong
// theme) — this hook just mirrors that state for the toggle UI and persists
// changes the user makes.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing or blocked storage — theme still applies this session.
    }
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, mounted, setTheme, toggleTheme };
}
