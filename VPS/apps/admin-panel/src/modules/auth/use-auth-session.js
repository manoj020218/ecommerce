import { useEffect, useMemo, useState } from "react";
import {
  clearAuthSession,
  getAuthSession,
  setAuthSession,
  subscribeAuthSession
} from "./auth.store";

export function useAuthSession() {
  const [session, setSessionState] = useState(() => getAuthSession());

  useEffect(() => {
    return subscribeAuthSession(setSessionState);
  }, []);

  return useMemo(
    () => ({
      session,
      isAuthenticated: Boolean(session?.accessToken),
      setSession: setAuthSession,
      clearSession: clearAuthSession
    }),
    [session]
  );
}
