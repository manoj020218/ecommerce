import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { adminMe, adminRefresh } from "./auth.api";
import { useAuthSession } from "./use-auth-session";

export function AuthGuard() {
  const location = useLocation();
  const { session, isAuthenticated, setSession, clearSession } = useAuthSession();
  const [state, setState] = useState("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!isAuthenticated || !session) {
        setState("unauthenticated");
        return;
      }

      try {
        const admin = await adminMe();
        if (!active) {
          return;
        }

        setSession({
          ...session,
          admin
        });
        setState("ready");
      } catch (_error) {
        if (!active) {
          return;
        }

        // 429 = rate limited, not an auth failure — keep the existing session
        if (_error?.status === 429) {
          setState("ready");
          return;
        }

        try {
          const refreshed = await adminRefresh(session.refreshToken);
          if (!active) {
            return;
          }

          setSession({
            ...refreshed
          });
          setState("ready");
        } catch (refreshError) {
          if (!active) {
            return;
          }

          // 429 on refresh also means rate limited, not expired — keep session
          if (refreshError?.status === 429) {
            setState("ready");
            return;
          }

          clearSession();
          setErrorMessage(refreshError.message || "Session expired. Login again.");
          setState("unauthenticated");
        }
      }
    }

    verify();

    return () => {
      active = false;
    };
  }, [clearSession, isAuthenticated, session, setSession]);

  if (state === "checking") {
    return <LoadingBlock label="Verifying admin session..." />;
  }

  if (state === "unauthenticated") {
    if (errorMessage) {
      return (
        <div className="auth-state-wrap">
          <ErrorBlock message={errorMessage} />
          <Navigate to="/login" replace state={{ from: location }} />
        </div>
      );
    }
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
