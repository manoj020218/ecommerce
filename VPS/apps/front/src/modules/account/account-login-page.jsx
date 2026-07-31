import { useEffect, useRef, useState } from "react";
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
import { getGoogleAuthConfig } from "./google-auth.api";

export function GoogleSignInButton({ redirectPath }) {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    getGoogleAuthConfig()
      .then((data) => { if (data?.enabled && data?.clientId) setConfig(data); })
      .catch(() => {});
  }, []);

  if (!config) return null;

  function handleGoogleLogin() {
    setBusy(true);
    const state = encodeURIComponent(JSON.stringify({ redirect: redirectPath }));
    const redirectUri = encodeURIComponent(`${window.location.origin}/account/google-callback`);
    const scope = encodeURIComponent("openid email profile");
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=online`;
    window.location.href = url;
  }

  return (
    <div className="proto-google-sso-row">
      <button
        type="button"
        className="proto-google-sso-btn"
        disabled={busy}
        onClick={handleGoogleLogin}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>
      <div className="proto-google-sso-divider">
        <span>or sign in with email</span>
      </div>
    </div>
  );
}

function FieldRow({ label, badge, children }) {
  return (
    <div className="reg-field-wrap">
      <div className="reg-label-row">
        <label className="reg-label">{label}</label>
        {badge && <span className="reg-badge-optional">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function RegInput({ type = "text", value, onChange, placeholder, required, inputMode }) {
  const [showPw, setShowPw] = useState(false);
  const isPw = type === "password";
  return (
    <div className="reg-input-wrap">
      <input
        className="reg-input"
        type={isPw ? (showPw ? "text" : "password") : type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        autoComplete={isPw ? "new-password" : undefined}
      />
      {isPw && (
        <button type="button" className="reg-pw-eye" onClick={() => setShowPw((v) => !v)} tabIndex={-1} aria-label="Toggle password visibility">
          {showPw ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          )}
        </button>
      )}
    </div>
  );
}

function CreateAccountCard({ busy, onSubmit }) {
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "", company: "", gstin: "" });
  const [showBiz, setShowBiz] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <StorefrontCard as="article" className="section-card reg-card" elevated>
      <div className="reg-card-header">
        <div className="reg-card-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <h2 className="reg-card-title">Create Account</h2>
          <p className="reg-card-subtitle">Start shopping in under 60 seconds</p>
        </div>
      </div>

      <form className="reg-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
        <FieldRow label="Full Name">
          <RegInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your full name" required />
        </FieldRow>

        <div className="reg-two-col">
          <FieldRow label="Email">
            <RegInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" required />
          </FieldRow>
          <FieldRow label="Mobile" badge="optional">
            <RegInput type="tel" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 98765 43210" inputMode="tel" />
          </FieldRow>
        </div>

        <FieldRow label="Password">
          <RegInput type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Minimum 8 characters" required />
        </FieldRow>

        <button type="button" className="reg-toggle-biz" onClick={() => setShowBiz((v) => !v)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showBiz ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}><path d="M9 18l6-6-6-6"/></svg>
          {showBiz ? "Hide" : "Add"} Business Details
          <span className="reg-badge-optional" style={{ marginLeft: 6 }}>GST Invoice</span>
        </button>

        {showBiz && (
          <div className="reg-biz-section">
            <div className="reg-two-col">
              <FieldRow label="Company Name" badge="optional">
                <RegInput value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Acme Pvt. Ltd." />
              </FieldRow>
              <FieldRow label="GSTIN" badge="optional">
                <RegInput value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="27AABCU9603R1ZX" />
              </FieldRow>
            </div>
            <p className="reg-biz-hint">Your GSTIN will be printed on GST invoices for all orders placed with this account.</p>
          </div>
        )}

        <button type="submit" className="reg-submit-btn" disabled={busy === "register"}>
          {busy === "register" ? (
            <>
              <span className="reg-submit-spinner" />
              Creating account…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Create Free Account
            </>
          )}
        </button>

        <p className="reg-legal-note">
          By creating an account you agree to our{" "}
          <a href="/privacy-policy" className="reg-legal-link">Privacy Policy</a>
          {" & "}
          <a href="/terms-and-conditions" className="reg-legal-link">Terms of Service</a>.
        </p>
      </form>
    </StorefrontCard>
  );
}

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

      <GoogleSignInButton redirectPath={redirectPath} />

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

        <CreateAccountCard busy={busy} onSubmit={(form) => {
          setBusy("register");
          applySession(
            registerCustomerEmail(form),
            "Account created. Redirecting to your dashboard."
          ).finally(() => setBusy(""));
        }} />

        {/* Mobile OTP hidden — pending WhatsApp free-message OTP integration */}
        <StorefrontCard as="article" className="section-card" elevated style={{ display: "none" }}>
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
