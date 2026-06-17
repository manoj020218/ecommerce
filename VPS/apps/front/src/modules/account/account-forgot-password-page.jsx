import { useState } from "react";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontCard,
  StorefrontInput,
  StorefrontPageHeader,
  StorefrontSectionHeader
} from "../../shared/storefront/storefront-ui";
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
    <main className="proto-main-shell account-shell">
      <StorefrontPageHeader
        eyebrow="Fallback Access"
        title="Forgot Password"
        description="Google login can remain the primary path. This email-password reset flow exists as fallback account access when needed."
        actions={<StorefrontButton to="/account/login" variant="light">Back to Login</StorefrontButton>}
      />

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <StorefrontCard as="section" className="section-card" elevated>
        <StorefrontSectionHeader
          title="Request Reset Link"
          description="Enter the customer email address. If the account exists, a reset link will be generated for email delivery."
        />
        <form className="stack-form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <StorefrontInput
              label="Customer Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>
          <StorefrontButton type="submit" disabled={busy}>
            {busy ? "Preparing..." : "Send Reset Link"}
          </StorefrontButton>
        </form>
      </StorefrontCard>

      {devResetUrl ? (
        <StorefrontCard as="section" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Development Reset Link"
            description="This helper is shown only in non-production environments for local fallback testing."
          />
          <StorefrontAlert>
            <a href={devResetUrl}>{devResetUrl}</a>
          </StorefrontAlert>
        </StorefrontCard>
      ) : null}
    </main>
  );
}
