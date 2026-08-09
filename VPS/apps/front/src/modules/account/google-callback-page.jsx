import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createCustomerSession, useCustomerSession } from "../../shared/auth/customer-session";
import { exchangeGoogleCode } from "./google-auth.api";
import { linkGuestCheckout } from "./account.api";

// Module-level (not component-level) so it survives this page component being
// unmounted and remounted for the same navigation — a plain useRef resets on
// every fresh mount and doesn't protect against that. Google authorization
// codes are single-use; resubmitting the same one gets rejected by Google
// even though the first exchange already succeeded, which is exactly what
// showed up as an intermittent "sign-in failed" that only cleared up after
// a manual retry (a retry gets a brand-new code from Google).
let lastAttemptedCode = "";

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession, isAuthenticated } = useCustomerSession();
  const [error, setError] = useState("");
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get("code");
    const stateStr = searchParams.get("state");

    // Strip the code out of the URL immediately — if this page reloads or
    // gets revisited (browser back/forward, a manual refresh), there's
    // nothing left in the address bar to resubmit.
    if (code) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    // A prior mount (or the previous page load) already used this exact
    // code. If we're already signed in, the earlier attempt succeeded —
    // just continue on instead of trying (and failing) to reuse it.
    if (code && code === lastAttemptedCode) {
      if (isAuthenticated) {
        navigate("/account", { replace: true });
      } else {
        setError("This sign-in link was already used. Please try again.");
      }
      return;
    }
    if (code) lastAttemptedCode = code;

    let state = {};
    try {
      if (stateStr) state = JSON.parse(decodeURIComponent(stateStr));
    } catch {}

    const redirectPath = (state.redirect && String(state.redirect).startsWith("/"))
      ? state.redirect
      : "/account";

    if (!code) {
      if (isAuthenticated) {
        navigate(redirectPath, { replace: true });
        return;
      }
      const errorParam = searchParams.get("error");
      setError(errorParam === "access_denied"
        ? "Google sign-in was cancelled."
        : "No authorization code received from Google. Please try again.");
      return;
    }

    const redirectUri = `${window.location.origin}/account/google-callback`;

    exchangeGoogleCode({ code, redirectUri, guestSessionId: state.guestSessionId || null })
      .then(async (payload) => {
        setSession(createCustomerSession(payload));
        if (state.linkCheckout) {
          try {
            await linkGuestCheckout({
              checkoutSessionId: state.linkCheckout,
              guestSessionId: state.guestSessionId || null
            });
          } catch (_linkErr) {
            // Linking failure is non-fatal — user is still logged in
          }
        }
        navigate(redirectPath, { replace: true });
      })
      .catch((err) => {
        setError(err.message || "Google sign-in failed. Please try again.");
      });
  }, []);

  if (error) {
    return (
      <main className="proto-main-shell">
        <div className="proto-page-hero" style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem" }}>Sign-in Failed</h1>
          <p style={{ color: "#6b7280", margin: "12px 0 24px" }}>{error}</p>
          <a href="/account/login" style={{
            display: "inline-block", padding: "10px 24px", borderRadius: 10,
            background: "var(--brand)", color: "#fff", fontWeight: 600, textDecoration: "none"
          }}>Back to Login</a>
        </div>
      </main>
    );
  }

  return (
    <main className="proto-main-shell">
      <div className="proto-page-hero" style={{ textAlign: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--brand)",
          borderTopColor: "transparent", margin: "0 auto 16px",
          animation: "spin 0.8s linear infinite"
        }} />
        <p style={{ color: "#6b7280", margin: 0 }}>Completing Google sign-in…</p>
      </div>
    </main>
  );
}
