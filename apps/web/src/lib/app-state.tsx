// Which member both interfaces are looking at. Shared across routes so
// switching between the caretaker dashboard and the senior view never
// silently changes the person you're looking at.
//
// The interface mode itself is NOT stored here — it's the route.
// /dashboard, /approvals, /demo are the caretaker interface; /simple is the
// senior one. That keeps one source of truth and makes the back button work.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

const MEMBER_KEY = "steelhacks.activeMemberId";

type AppState = {
  /** Null until the member list loads. */
  activeMemberId: string | null;
  setActiveMemberId: (id: string) => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [activeMemberId, setActiveMemberIdState] = useState<string | null>(null);

  // localStorage doesn't exist during SSR, so read it after hydration.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MEMBER_KEY);
      if (stored) setActiveMemberIdState(stored);
    } catch {
      // Private browsing or blocked storage — one member is the common case anyway.
    }
  }, []);

  const setActiveMemberId = useCallback((id: string) => {
    setActiveMemberIdState(id);
    try {
      window.localStorage.setItem(MEMBER_KEY, id);
    } catch {
      // Ignore; state still holds for this session.
    }
  }, []);

  const value = useMemo(
    () => ({ activeMemberId, setActiveMemberId }),
    [activeMemberId, setActiveMemberId],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside <AppStateProvider>");
  return value;
}
