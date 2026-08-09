import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontErrorState
} from "../../shared/storefront/storefront-ui";
import { FieldRow, RegInput } from "../../shared/storefront/auth-form-fields";
import { resetCustomerPassword } from "./account.api";

export function CustomerResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const tokenMissing = useMemo(() => !token.trim(), [token]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await resetCustomerPassword({
        token,
        password
      });
      setNotice("Password updated. You can now sign in with email and password.");
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError.message || "Password reset failed.");
    } finally {
      setBusy(false);
    }
  }

  if (tokenMissing) {
    return (
      <main className="proto-main-shell">
        <StorefrontErrorState
          message="Reset token is missing. Open the full link from the reset email or request a new one."
          action={<StorefrontButton to="/account/forgot-password" variant="light">Request New Link</StorefrontButton>}
        />
      </main>
    );
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
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <div className="proto-checkout-card-head">
          <h2>Choose a new password</h2>
          <span>Use at least 8 characters</span>
        </div>

        <form className="reg-form" onSubmit={handleSubmit}>
          <FieldRow label="New Password">
            <RegInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter new password"
              required
            />
          </FieldRow>
          <FieldRow label="Confirm Password">
            <RegInput
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter new password"
              required
            />
          </FieldRow>
          <button type="submit" className="proto-login-gate-btn proto-btn proto-btn-primary" disabled={busy}>
            {busy ? "Updating..." : "Reset Password"}
          </button>
        </form>
      </article>
    </main>
  );
}
