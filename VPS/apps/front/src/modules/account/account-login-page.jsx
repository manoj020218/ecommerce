import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createCustomerSession, useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontCard,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontSectionHeader
} from "../../shared/storefront/storefront-ui";
import {
  loginCustomerEmail,
  registerCustomerEmail,
  requestCustomerOtp,
  verifyCustomerOtp
} from "./account.api";

function resolveRedirect(searchParams) {
  const requestedPath = searchParams.get("redirect");
  if (requestedPath && requestedPath.startsWith("/")) {
    return requestedPath;
  }
  return "/account";
}

export function CustomerAccountLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = resolveRedirect(searchParams);
  const { isAuthenticated, loading, setSession } = useCustomerSession();

  const [emailLogin, setEmailLogin] = useState({
    email: "",
    password: ""
  });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: ""
  });
  const [otpForm, setOtpForm] = useState({
    mobile: "",
    code: "",
    name: ""
  });
  const [otpState, setOtpState] = useState({
    challengeId: "",
    devCode: "",
    expiresAt: ""
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, loading, navigate, redirectPath]);

  async function applySession(promise, successMessage) {
    setError("");
    setInfo("");
    try {
      const payload = await promise;
      setSession(createCustomerSession(payload));
      setInfo(successMessage);
      navigate(redirectPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Authentication failed.");
    }
  }

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading your customer session..." />
      </main>
    );
  }

  return (
    <main className="proto-main-shell account-shell">
      <div className="proto-page-hero">
        <div className="hero-kicker-row">
          <StorefrontButton to="/" variant="light">
            Browse products
          </StorefrontButton>
          <span className="eyebrow-chip">Customer Access</span>
        </div>
        <div className="account-hero-copy">
          <div>
            <p className="eyebrow-text">Customer self-service</p>
            <h1>Sign in to orders, invoices, tracking, and GST details</h1>
            <p className="hero-muted">
              Use email login, create a new account, or verify a mobile number with OTP.
              Verified email or verified mobile is required before linking guest orders later.
            </p>
          </div>
          <div className="hero-stat-grid">
            <div className="metric-card">
              <strong>Orders</strong>
              <span>View order history and reorder with current pricing.</span>
            </div>
            <div className="metric-card">
              <strong>Invoices</strong>
              <span>Download GST invoices from your own account only.</span>
            </div>
          </div>
        </div>
      </div>

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {info ? <StorefrontAlert>{info}</StorefrontAlert> : null}

      <section className="proto-auth-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Email Login"
            description="Use an existing email and password."
          />
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy("login");
              applySession(loginCustomerEmail(emailLogin), "Customer session ready.").finally(
                () => setBusy("")
              );
            }}
          >
            <div className="field-grid">
              <StorefrontInput
                label="Email"
                type="email"
                value={emailLogin.email}
                onChange={(event) =>
                  setEmailLogin((current) => ({
                    ...current,
                    email: event.target.value
                  }))
                }
                placeholder="name@example.com"
                required
              />
              <StorefrontInput
                label="Password"
                type="password"
                value={emailLogin.password}
                onChange={(event) =>
                  setEmailLogin((current) => ({
                    ...current,
                    password: event.target.value
                  }))
                }
                placeholder="Your password"
                required
              />
            </div>
            <StorefrontButton type="submit" disabled={busy === "login"}>
              {busy === "login" ? "Signing in..." : "Sign In"}
            </StorefrontButton>
            <div className="action-row">
              <StorefrontButton to="/account/forgot-password" variant="light">
                Forgot Password
              </StorefrontButton>
            </div>
          </form>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Create Account"
            description="Register a customer account with email and password."
          />
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy("register");
              applySession(
                registerCustomerEmail(registerForm),
                "Account created. Redirecting to your dashboard."
              ).finally(() => setBusy(""));
            }}
          >
            <div className="field-grid">
              <StorefrontInput
                label="Name"
                value={registerForm.name}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                placeholder="Your full name"
                required
              />
              <StorefrontInput
                label="Email"
                type="email"
                value={registerForm.email}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    email: event.target.value
                  }))
                }
                placeholder="name@example.com"
                required
              />
              <StorefrontInput
                label="Mobile"
                value={registerForm.mobile}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    mobile: event.target.value
                  }))
                }
                placeholder="+91-98xxxxxx10"
              />
              <StorefrontInput
                label="Password"
                type="password"
                value={registerForm.password}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    password: event.target.value
                  }))
                }
                placeholder="Choose a password"
                required
              />
            </div>
            <StorefrontButton type="submit" variant="dark" disabled={busy === "register"}>
              {busy === "register" ? "Creating..." : "Create Account"}
            </StorefrontButton>
          </form>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Mobile OTP"
            description="Verify a mobile number and access guest-linked orders safely."
          />
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy("otp-request");
              setError("");
              setInfo("");
              requestCustomerOtp({ mobile: otpForm.mobile })
                .then((payload) => {
                  setOtpState({
                    challengeId: payload.challengeId || "",
                    devCode: payload.devCode || "",
                    expiresAt: payload.expiresAt || ""
                  });
                  setInfo("OTP sent. Enter the code below to finish login.");
                })
                .catch((requestError) => {
                  setError(requestError.message || "Failed to request OTP.");
                })
                .finally(() => {
                  setBusy("");
                });
            }}
          >
            <div className="field-grid">
              <StorefrontInput
                label="Mobile"
                value={otpForm.mobile}
                onChange={(event) =>
                  setOtpForm((current) => ({
                    ...current,
                    mobile: event.target.value
                  }))
                }
                placeholder="+91-98xxxxxx10"
                required
              />
              <StorefrontInput
                label="Name"
                value={otpForm.name}
                onChange={(event) =>
                  setOtpForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                placeholder="Name for first login"
                required
              />
            </div>
            <StorefrontButton type="submit" variant="light" disabled={busy === "otp-request"}>
              {busy === "otp-request" ? "Sending..." : "Request OTP"}
            </StorefrontButton>
          </form>

          <form
            className="stack-form otp-verify-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy("otp-verify");
              applySession(
                verifyCustomerOtp({
                  mobile: otpForm.mobile,
                  code: otpForm.code,
                  name: otpForm.name
                }),
                "OTP verified. Redirecting to your account."
              ).finally(() => setBusy(""));
            }}
          >
            <div className="field-grid">
              <StorefrontInput
                label="OTP Code"
                value={otpForm.code}
                onChange={(event) =>
                  setOtpForm((current) => ({
                    ...current,
                    code: event.target.value
                  }))
                }
                placeholder="6-digit code"
                required
              />
            </div>
            {otpState.devCode ? (
              <div className="inline-note">
                Development OTP: <strong>{otpState.devCode}</strong>
              </div>
            ) : null}
            {otpState.expiresAt ? (
              <div className="inline-note">Valid until {otpState.expiresAt}</div>
            ) : null}
            <StorefrontButton type="submit" disabled={busy === "otp-verify"}>
              {busy === "otp-verify" ? "Verifying..." : "Verify OTP"}
            </StorefrontButton>
          </form>
        </StorefrontCard>
      </section>
    </main>
  );
}
