import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontCard,
  StorefrontErrorState,
  StorefrontInput,
  StorefrontPageHeader,
  StorefrontSectionHeader
} from "../../shared/storefront/storefront-ui";
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
    <main className="proto-main-shell account-shell">
      <StorefrontPageHeader
        eyebrow="Fallback Access"
        title="Reset Password"
        description="Set a new fallback password for customer email login. Google login can still remain the primary sign-in path."
        actions={<StorefrontButton to="/account/login" variant="light">Back to Login</StorefrontButton>}
      />

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <StorefrontCard as="section" className="section-card" elevated>
        <StorefrontSectionHeader
          title="Choose New Password"
          description="Use at least 8 characters. After reset, sign in from the customer login page."
        />
        <form className="stack-form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <StorefrontInput
              label="New Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter new password"
              required
            />
            <StorefrontInput
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter new password"
              required
            />
          </div>
          <StorefrontButton type="submit" disabled={busy}>
            {busy ? "Updating..." : "Reset Password"}
          </StorefrontButton>
        </form>
      </StorefrontCard>
    </main>
  );
}
