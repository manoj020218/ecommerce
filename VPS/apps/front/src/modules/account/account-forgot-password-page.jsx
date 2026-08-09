import { useState } from "react";
import {
  StorefrontAlert,
  StorefrontButton
} from "../../shared/storefront/storefront-ui";
import { FieldRow, RegInput } from "../../shared/storefront/auth-form-fields";
import { requestCustomerPasswordReset } from "./account.api";

export function CustomerForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setDevResetUrl("");

    try {
      const payload = await requestCustomerPasswordReset({ email });
      setNotice(
        "If this email exists in the customer account system, reset instructions have been prepared."
      );
      setDevResetUrl(payload?.devResetUrl || "");
    } catch (requestError) {
      setError(requestError.message || "Password reset request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="proto-main-shell account-shell auth-shell">
      <div className="auth-topbar">
        <StorefrontButton to="/account/login" variant="light" className="auth-back-link">
          ← Back to Sign In
        </StorefrontButton>
      </div>

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <article className="proto-checkout-card proto-login-gate-v2 auth-card">
        <div className="proto-login-gate-badge" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </div>
        <div className="proto-checkout-card-head">
          <h2>Forgot your password?</h2>
          <span>Enter your email and we'll send you a reset link</span>
        </div>

        <form className="reg-form" onSubmit={handleSubmit}>
          <FieldRow label="Email">
            <RegInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </FieldRow>
          <button type="submit" className="proto-login-gate-btn proto-btn proto-btn-primary" disabled={busy}>
            {busy ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </article>

      {devResetUrl ? (
        <article className="proto-checkout-card auth-card">
          <p className="auth-footnote-title" style={{ marginBottom: 8 }}>Development reset link</p>
          <StorefrontAlert>
            <a href={devResetUrl}>{devResetUrl}</a>
          </StorefrontAlert>
        </article>
      ) : null}
    </main>
  );
}
