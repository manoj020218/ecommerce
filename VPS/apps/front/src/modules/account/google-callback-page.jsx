import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createCustomerSession, useCustomerSession } from "../../shared/auth/customer-session";
import { exchangeGoogleCode } from "./google-auth.api";

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useCustomerSession();
  const [error, setError] = useState("");
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get("code");
    const stateStr = searchParams.get("state");

    let state = {};
    try {
      if (stateStr) state = JSON.parse(decodeURIComponent(stateStr));
    } catch {}

    const redirectPath = (state.redirect && String(state.redirect).startsWith("/"))
      ? state.redirect
      : "/account";

    if (!code) {
      const errorParam = searchParams.get("error");
      setError(errorParam === "access_denied"
        ? "Google sign-in was cancelled."
        : "No authorization code received from Google. Please try again.");
      return;
    }

    const redirectUri = `${window.location.origin}/account/google-callback`;

    exchangeGoogleCode({ code, redirectUri, guestSessionId: state.guestSessionId || null })
      .then((payload) => {
        setSession(createCustomerSession(payload));
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
