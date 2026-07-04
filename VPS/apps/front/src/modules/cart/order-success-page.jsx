import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { submitManualPaymentProof, requestEmailOtp, verifyEmailOtp, linkGuestCheckout } from "../account/account.api";
import { getGoogleAuthConfig } from "../account/google-auth.api";
import { createCustomerSession, useCustomerSession } from "../../shared/auth/customer-session";
import {
  canSubmitManualPaymentProof,
  downloadInvoicePayload,
  formatAddress,
  formatCurrency,
  formatDate,
  getSupportWhatsappLink,
  humanizeStatus
} from "../account/account.utils";
import { usePublicSettings } from "../settings/public-settings-context";
import {
  createPaymentAttempt,
  downloadCheckoutInvoice,
  getCheckoutOrderFollowup
} from "../products/products.api";
import { getExistingGuestSessionId } from "./cart.utils";
import {
  StorefrontAlert,
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontFileInput,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontSectionHeader,
  StorefrontStickyActionBar,
  StorefrontTextArea
} from "../../shared/storefront/storefront-ui";

function SuccessIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function humanizeInstructionKey(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "paid" ||
    normalized === "delivered" ||
    normalized === "verified" ||
    normalized === "success" ||
    normalized === "completed"
  ) {
    return "success";
  }

  if (
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "expired" ||
    normalized === "rejected"
  ) {
    return "danger";
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("awaiting") ||
    normalized === "quote_required" ||
    normalized === "payment_attempt_created"
  ) {
    return "warning";
  }

  return "info";
}

function resolveHeadline(order, session) {
  const paymentMethod = order?.paymentMethod || session?.paymentMethod || "";
  const paymentStatus = order?.paymentStatus || session?.status || "";
  const orderStatus = order?.orderStatus || "";

  if (orderStatus === "awaiting_admin_approval") {
    return "Order request received";
  }

  if (paymentMethod === "online" && paymentStatus !== "paid") {
    return "Order placed, payment pending";
  }

  if (paymentStatus === "paid") {
    return "Payment received";
  }

  return "Order placed";
}

function resolveNextStep({ order, session, hasManualInstructions, pickupAddress }) {
  const paymentMethod = order?.paymentMethod || session?.paymentMethod || "";
  const paymentStatus = order?.paymentStatus || session?.status || "";
  const orderStatus = order?.orderStatus || "";
  const shippingMethod = order?.shippingMethod || session?.shippingMethod || "";
  const manualPaymentStatus = order?.manualPaymentStatus || "";
  const expectedDelivery = order?.trackingDetails?.expectedDeliveryDate || "";

  if (expectedDelivery) {
    return `Expected delivery: ${expectedDelivery}.`;
  }

  if (orderStatus === "awaiting_admin_approval") {
    return "Your order request is waiting for admin approval before payment collection or dispatch can begin.";
  }

  if (paymentMethod === "online" && paymentStatus !== "paid") {
    return "Complete the payment link to confirm the order. Dispatch starts after payment capture.";
  }

  if (
    (paymentMethod === "direct_bank_transfer" || paymentMethod === "manual_upi") &&
    hasManualInstructions &&
    manualPaymentStatus !== "verified"
  ) {
    return "Transfer the amount using the instructions below, then upload proof so the team can verify payment and release dispatch.";
  }

  if (shippingMethod === "self_pickup" || shippingMethod === "local_pickup") {
    return pickupAddress
      ? `Pickup will be coordinated by the store team from ${pickupAddress}.`
      : "Pickup timing will be shared by the store team after confirmation.";
  }

  if (shippingMethod === "express") {
    return "Priority dispatch is scheduled after payment confirmation.";
  }

  if (shippingMethod === "transport") {
    return "Transport booking will be coordinated after payment confirmation.";
  }

  return "Dispatch will begin after payment confirmation and order verification.";
}

function buildCheckoutAccessParams(isAuthenticated) {
  const guestSessionId = getExistingGuestSessionId();
  return isAuthenticated ? {} : { sessionId: guestSessionId || "" };
}

function CheckoutAccountLink({ checkoutSessionId, guestSessionId, onLinked }) {
  const { setSession } = useCustomerSession();
  const [step, setStep] = useState("idle"); // idle | email | otp | linking | done | dismissed
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleConfig, setGoogleConfig] = useState(null);
  const fetchedGoogleConfig = useRef(false);

  useEffect(() => {
    if (fetchedGoogleConfig.current) return;
    fetchedGoogleConfig.current = true;
    getGoogleAuthConfig()
      .then((data) => { if (data?.enabled && data?.clientId) setGoogleConfig(data); })
      .catch(() => {});
  }, []);

  async function handleRequestOtp(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestEmailOtp({ email: email.trim() });
      setExpiresAt(result.expiresAt || "");
      setDevCode(result.devCode || "");
      setStep("otp");
    } catch (err) {
      setError(err.message || "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const authPayload = await verifyEmailOtp({ email: email.trim(), code: code.trim(), guestSessionId });
      setSession(createCustomerSession(authPayload));
      setStep("linking");
      await linkGuestCheckout({ checkoutSessionId, guestSessionId });
      setStep("done");
      onLinked();
    } catch (err) {
      setError(err.message || "Verification failed.");
      if (step === "linking") setStep("otp");
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleLogin() {
    const state = encodeURIComponent(JSON.stringify({
      redirect: window.location.pathname + window.location.search,
      linkCheckout: checkoutSessionId,
      guestSessionId: guestSessionId || null
    }));
    const redirectUri = encodeURIComponent(`${window.location.origin}/account/google-callback`);
    const scope = encodeURIComponent("openid email profile");
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleConfig.clientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=online`;
  }

  if (step === "done" || step === "dismissed") return null;

  return (
    <div className="proto-acct-link-card">
      {step === "idle" && (
        <>
          <div className="proto-acct-link-header">
            <div className="proto-acct-link-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <h3 className="proto-acct-link-title">Get order updates</h3>
              <p className="proto-acct-link-sub">Save your order for easy tracking and reorders</p>
            </div>
          </div>
          <div className="proto-acct-link-actions">
            {googleConfig ? (
              <button type="button" className="proto-google-sso-btn proto-acct-link-google" onClick={handleGoogleLogin}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            ) : null}
            <button type="button" className="proto-acct-link-email-btn" onClick={() => setStep("email")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>
              Verify with Email OTP
            </button>
            <button type="button" className="proto-acct-link-skip" onClick={() => setStep("dismissed")}>
              Skip for now
            </button>
          </div>
        </>
      )}

      {step === "email" && (
        <form className="proto-acct-link-form" onSubmit={handleRequestOtp}>
          <h3 className="proto-acct-link-title">Enter your email</h3>
          <p className="proto-acct-link-sub">We&apos;ll send a 6-digit code to verify your order</p>
          <input
            className="proto-acct-link-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
          />
          {error ? <p className="proto-acct-link-error">{error}</p> : null}
          <div className="proto-acct-link-btn-row">
            <button type="submit" className="proto-acct-link-submit" disabled={busy}>
              {busy ? "Sending…" : "Send Code"}
            </button>
            <button type="button" className="proto-acct-link-skip" onClick={() => setStep("idle")}>Back</button>
          </div>
        </form>
      )}

      {(step === "otp" || step === "linking") && (
        <form className="proto-acct-link-form" onSubmit={handleVerifyOtp}>
          <h3 className="proto-acct-link-title">Enter verification code</h3>
          <p className="proto-acct-link-sub">Code sent to <strong>{email}</strong>{expiresAt ? ` · valid 10 min` : ""}</p>
          {devCode ? <p className="proto-acct-link-devcode">Dev code: <strong>{devCode}</strong></p> : null}
          <input
            className="proto-acct-link-input proto-acct-link-otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            required
            autoFocus
          />
          {error ? <p className="proto-acct-link-error">{error}</p> : null}
          <div className="proto-acct-link-btn-row">
            <button type="submit" className="proto-acct-link-submit" disabled={busy || step === "linking"}>
              {step === "linking" ? "Linking order…" : busy ? "Verifying…" : "Verify & Save Order"}
            </button>
            <button type="button" className="proto-acct-link-skip" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
              Resend
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function OrderSuccessPage() {
  const { checkoutSessionId: routeCheckoutSessionId = "" } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useCustomerSession();
  const { settings: publicSettings } = usePublicSettings();
  const [checkoutSession, setCheckoutSession] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [manualPaymentBusy, setManualPaymentBusy] = useState(false);
  const [paymentLink, setPaymentLink] = useState(() => {
    return (
      searchParams.get("paymentLink") ||
      location.state?.paymentAttempt?.gatewayPaymentLink ||
      ""
    );
  });
  const [manualInstructions, setManualInstructions] = useState(() => {
    return location.state?.manualPaymentInstructions?.instructions || null;
  });
  const [manualPaymentForm, setManualPaymentForm] = useState({
    utrNumber: "",
    note: "",
    file: null
  });

  const gaPurchaseFiredRef = useRef(false);

  const isFollowupMode = Boolean(routeCheckoutSessionId);
  const sessionId = routeCheckoutSessionId || searchParams.get("session") || "";
  const orderIdParam = searchParams.get("orderId") || "";
  const orderNoParam = searchParams.get("orderNo") || "";

  async function loadSuccessState(options = {}) {
    const { showSpinner = true, isActive = () => true } = options;

    if (!sessionId) {
      if (isActive()) {
        setError("Checkout session is missing. Restart checkout from the cart.");
        setLoading(false);
      }
      return;
    }

    if (showSpinner && isActive()) {
      setLoading(true);
    }
    if (isActive()) {
      setError("");
    }

    try {
      const followup = await getCheckoutOrderFollowup(
        sessionId,
        buildCheckoutAccessParams(isAuthenticated)
      );

      if (!isActive()) {
        return;
      }

      setCheckoutSession(followup?.checkoutSession || null);
      setOrder(followup?.order || null);
      setManualInstructions(
        followup?.order?.manualPaymentInstructions?.instructions ||
          location.state?.manualPaymentInstructions?.instructions ||
          null
      );
    } catch (requestError) {
      if (isActive()) {
        setError(requestError.message || "Order confirmation could not be loaded.");
      }
    } finally {
      if (showSpinner && isActive()) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let active = true;

    loadSuccessState({
      isActive: () => active
    });

    return () => {
      active = false;
    };
  }, [isAuthenticated, sessionId]);

  // GA4 purchase conversion — fires once when order data arrives
  useEffect(() => {
    if ((!order && !checkoutSession) || gaPurchaseFiredRef.current) return;
    if (typeof window.gtag !== "function") return;

    gaPurchaseFiredRef.current = true;

    const txId = order?.orderNo || order?.id || checkoutSession?.orderId || sessionId;
    const grandTotal = order?.orderTotal || order?.pricing?.grandTotal || checkoutSession?.cart?.pricing?.grandTotal || 0;
    const lineItems = Array.isArray(order?.items)
      ? order.items
      : (checkoutSession?.cart?.items || []);

    window.gtag("event", "purchase", {
      transaction_id: String(txId),
      value: Number(grandTotal),
      currency: "INR",
      items: lineItems.map((item, idx) => ({
        item_id: item.sku || item.productId,
        item_name: item.title,
        price: Number(item.unitPrice || item.salePrice || 0),
        quantity: Number(item.qty || 1),
        index: idx
      }))
    });

    if (typeof window.fbq === "function") {
      window.fbq("track", "Purchase", {
        value: Number(grandTotal),
        currency: "INR",
        content_ids: lineItems.map((item) => item.sku || item.productId).filter(Boolean),
        content_type: "product",
        num_items: lineItems.length
      });
    }
  }, [order, checkoutSession]);

  const supportPhone =
    publicSettings.contactInformation.publicPhone ||
    publicSettings.storeProfile.supportMobile ||
    "";
  const supportWhatsApp =
    publicSettings.contactInformation.publicWhatsApp ||
    publicSettings.storeProfile.whatsappNumber ||
    "";
  const pickupAddress =
    publicSettings.storeProfile.pickupAddress ||
    publicSettings.contactInformation.publicAddress ||
    "";
  const effectiveOrderId = order?.id || orderIdParam || checkoutSession?.orderId || "";
  const effectiveOrderNo =
    order?.orderNo ||
    location.state?.orderSummary?.orderNo ||
    orderNoParam ||
    effectiveOrderId ||
    sessionId;
  const items = useMemo(
    () => (Array.isArray(order?.items) ? order.items : checkoutSession?.cart?.items || []),
    [checkoutSession?.cart?.items, order?.items]
  );
  const total =
    order?.orderTotal ||
    order?.pricing?.grandTotal ||
    checkoutSession?.cart?.pricing?.grandTotal ||
    0;
  const paymentStatus = order?.paymentStatus || checkoutSession?.status || "pending";
  const orderStatus = order?.orderStatus || checkoutSession?.status || "started";
  const shipmentStatus = order?.shipmentStatus || "pending_packing";
  const paymentMethod = order?.paymentMethod || checkoutSession?.paymentMethod || "";
  const shippingMethod = order?.shippingMethod || checkoutSession?.shippingMethod || "";
  const headline = resolveHeadline(order, checkoutSession);
  const manualInstructionEntries = Object.entries(manualInstructions || {}).filter(([, value]) =>
    Boolean(value)
  );
  const canSubmitManualPayment = canSubmitManualPaymentProof(order);
  const nextStepCopy = resolveNextStep({
    order,
    session: checkoutSession,
    hasManualInstructions: manualInstructionEntries.length > 0,
    pickupAddress
  });
  const whatsappLink = getSupportWhatsappLink(
    supportWhatsApp,
    `Need help with order ${effectiveOrderNo || sessionId}.`
  );
  const guestOrderLink = checkoutSession?.id ? `/orders/guest/${checkoutSession.id}` : "";
  const showGuestFollowupLink =
    !isAuthenticated && Boolean(order) && Boolean(guestOrderLink) && !isFollowupMode;

  async function handleCreatePaymentLink() {
    if (!checkoutSession?.id) {
      return;
    }

    setPaymentBusy(true);
    setError("");
    setNotice("");

    try {
      const attempt = await createPaymentAttempt({
        ...buildCheckoutAccessParams(isAuthenticated),
        checkoutSessionId: checkoutSession.id
      });
      setPaymentLink(attempt?.gatewayPaymentLink || "");
      setNotice("Payment link created. Continue to complete payment.");
    } catch (requestError) {
      setError(requestError.message || "Payment link could not be created.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function handleDownloadInvoice() {
    if (!checkoutSession?.id || !order?.invoice?.id) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const payload = await downloadCheckoutInvoice(
        checkoutSession.id,
        buildCheckoutAccessParams(isAuthenticated)
      );
      downloadInvoicePayload(payload);
      setNotice("Invoice download prepared.");
    } catch (requestError) {
      setError(requestError.message || "Invoice download failed.");
    }
  }

  async function handleManualPaymentSubmit(event) {
    event.preventDefault();

    if (!order?.id) {
      setError("Order detail is still loading. Refresh and try again.");
      return;
    }

    if (!manualPaymentForm.file) {
      setError("Payment screenshot is required.");
      return;
    }

    const accessParams = buildCheckoutAccessParams(isAuthenticated);
    if (!isAuthenticated && !accessParams.sessionId) {
      setError(
        "Guest order access is missing in this browser. Use the original checkout browser or sign in and link the order."
      );
      return;
    }

    setManualPaymentBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      if (accessParams.sessionId) {
        formData.append("sessionId", accessParams.sessionId);
      }
      formData.append("orderId", order.id);
      formData.append("paymentMethod", order.paymentMethod || "direct_bank_transfer");
      formData.append("utrNumber", manualPaymentForm.utrNumber);
      formData.append("note", manualPaymentForm.note);
      formData.append("file", manualPaymentForm.file);

      await submitManualPaymentProof(formData);
      setManualPaymentForm({
        utrNumber: "",
        note: "",
        file: null
      });
      setNotice("Payment proof submitted for admin verification.");
      await loadSuccessState({ showSpinner: false });
    } catch (requestError) {
      setError(requestError.message || "Payment proof submission failed.");
    } finally {
      setManualPaymentBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading order confirmation..." />
      </main>
    );
  }

  return (
    <main className="proto-main-shell proto-checkout-page proto-success-page">
      <section className="proto-success-hero">
        <div className="proto-success-icon proto-success-icon-anim">
          <SuccessIcon />
        </div>
        <StorefrontBadge tone={statusTone(paymentStatus)}>
          {paymentStatus === "paid" ? "Payment confirmed" : humanizeStatus(paymentStatus)}
        </StorefrontBadge>
        <h1>{headline}</h1>
        <p>
          {effectiveOrderNo
            ? `Reference ${effectiveOrderNo}. Keep this number for payment, support, and invoice follow-up.`
            : "Your checkout record has been created."}
        </p>
      </section>

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      {!isAuthenticated && checkoutSession?.id ? (
        <CheckoutAccountLink
          checkoutSessionId={checkoutSession.id}
          guestSessionId={getExistingGuestSessionId() || ""}
          onLinked={() => loadSuccessState({ showSpinner: false })}
        />
      ) : null}

      <div className="proto-checkout-layout proto-success-layout">
        <section className="proto-checkout-main">
          <StorefrontCard className="proto-checkout-card">
            <StorefrontSectionHeader
              title="Order Snapshot"
              description="Core order, payment, and dispatch details captured from the checkout session."
            />
            <div className="proto-feature-chip-row">
              <StorefrontBadge tone={statusTone(paymentStatus)}>
                Payment: {humanizeStatus(paymentStatus)}
              </StorefrontBadge>
              <StorefrontBadge tone={statusTone(orderStatus)}>
                Order: {humanizeStatus(orderStatus)}
              </StorefrontBadge>
              <StorefrontBadge tone={statusTone(shipmentStatus)}>
                Shipment: {humanizeStatus(shipmentStatus)}
              </StorefrontBadge>
            </div>
            <div className="proto-summary-rows">
              <div>
                <span>Order Number</span>
                <strong>{effectiveOrderNo || "--"}</strong>
              </div>
              <div>
                <span>Checkout Session</span>
                <strong>{checkoutSession?.id || "--"}</strong>
              </div>
              <div>
                <span>Created On</span>
                <strong>{formatDate(order?.orderDate || checkoutSession?.createdAt)}</strong>
              </div>
              <div>
                <span>Payment Method</span>
                <strong>{humanizeStatus(paymentMethod)}</strong>
              </div>
              <div>
                <span>Shipping Method</span>
                <strong>{humanizeStatus(shippingMethod)}</strong>
              </div>
              <div>
                <span>Grand Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
            </div>
            <StorefrontAlert tone="warning">{nextStepCopy}</StorefrontAlert>
            {!isAuthenticated && guestOrderLink ? (
              <StorefrontAlert>
                Keep this guest order link on the same browser for payment proof, invoice
                download, and support follow-up. You can also sign in later and link the
                order from your account using the same contact details.
              </StorefrontAlert>
            ) : null}
          </StorefrontCard>

          {manualInstructionEntries.length > 0 || canSubmitManualPayment ? (
            <StorefrontCard className="proto-checkout-card">
              <StorefrontSectionHeader
                title="Payment Instructions"
                description="Use these details if this order requires manual bank transfer or UPI verification."
              />
              {manualInstructionEntries.length > 0 ? (
                <div className="proto-summary-rows proto-summary-rows-compact">
                  {manualInstructionEntries.map(([key, value]) => (
                    <div key={key}>
                      <span>{humanizeInstructionKey(key)}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <StorefrontAlert tone="warning">
                  Manual payment details are not available on this order yet. Contact
                  support before transferring funds.
                </StorefrontAlert>
              )}

              {canSubmitManualPayment ? (
                <form
                  id="guest-manual-payment-form"
                  className="stack-form"
                  onSubmit={handleManualPaymentSubmit}
                >
                  <div className="field-grid">
                    <StorefrontInput
                      label="UTR / Reference Number"
                      value={manualPaymentForm.utrNumber}
                      onChange={(event) =>
                        setManualPaymentForm((current) => ({
                          ...current,
                          utrNumber: event.target.value
                        }))
                      }
                      required
                    />
                    <StorefrontFileInput
                      label="Payment Screenshot"
                      hint="Accepted formats: image or PDF proof."
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(event) =>
                        setManualPaymentForm((current) => ({
                          ...current,
                          file: event.target.files?.[0] || null
                        }))
                      }
                      required
                    />
                    <StorefrontTextArea
                      label="Note"
                      fieldClassName="field-span-2"
                      value={manualPaymentForm.note}
                      onChange={(event) =>
                        setManualPaymentForm((current) => ({
                          ...current,
                          note: event.target.value
                        }))
                      }
                      rows={3}
                      placeholder="Optional payment note"
                    />
                  </div>
                  <StorefrontButton type="submit" disabled={manualPaymentBusy}>
                    {manualPaymentBusy ? "Submitting..." : "Submit Payment Proof"}
                  </StorefrontButton>
                </form>
              ) : order?.manualPaymentStatus === "submitted" ? (
                <StorefrontAlert>
                  Payment proof has already been submitted and is waiting for admin
                  verification.
                </StorefrontAlert>
              ) : null}
            </StorefrontCard>
          ) : null}

          <StorefrontCard className="proto-checkout-card">
            <StorefrontSectionHeader
              title="Items"
              description={`${items.length} line item${items.length === 1 ? "" : "s"} in this checkout.`}
            />
            <div className="proto-checkout-items">
              {items.map((item) => (
                <div
                  key={`${item.productId || item.sku}-${item.title}`}
                  className="proto-checkout-item"
                >
                  <div className="proto-checkout-item-media">
                    <span>{item.sku || "Jenix"}</span>
                  </div>
                  <div className="proto-checkout-item-copy">
                    <p>{item.title}</p>
                    <span>
                      Qty {Number(item.qty || 0)} | {humanizeStatus(item.availabilityStatus)}
                    </span>
                    <strong>
                      {formatCurrency(
                        item.lineTotal || item.finalUnitPriceAfterDiscount || 0
                      )}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </StorefrontCard>

          <StorefrontCard className="proto-checkout-card proto-next-steps-card">
            <StorefrontSectionHeader
              title="What Happens Next?"
              description="Here's what to expect after placing your order."
            />
            <ol className="proto-next-steps">
              <li>
                <div className="proto-step-circle amber">1</div>
                <div>
                  <strong>Payment Verification (2–4 hrs)</strong>
                  <p>Our team verifies your payment and confirms your order.</p>
                </div>
              </li>
              <li>
                <div className="proto-step-circle blue">2</div>
                <div>
                  <strong>Order Processing (1 business day)</strong>
                  <p>We&apos;ll pack your items and generate your GST invoice.</p>
                </div>
              </li>
              <li>
                <div className="proto-step-circle green">3</div>
                <div>
                  <strong>Dispatch &amp; Tracking (5–7 days)</strong>
                  <p>You&apos;ll receive a tracking link via SMS and email once dispatched.</p>
                </div>
              </li>
            </ol>
          </StorefrontCard>

          <StorefrontCard className="proto-checkout-card">
            <StorefrontSectionHeader
              title="Addresses"
              description="Billing and shipping snapshots captured during checkout."
            />
            <div className="proto-summary-rows">
              <div>
                <span>Billing Address</span>
                <strong>
                  {formatAddress(order?.billingAddress || checkoutSession?.billingAddress || {}) ||
                    "--"}
                </strong>
              </div>
              <div>
                <span>Shipping Address</span>
                <strong>
                  {formatAddress(order?.shippingAddress || checkoutSession?.shippingAddress || {}) ||
                    "--"}
                </strong>
              </div>
            </div>
          </StorefrontCard>
        </section>

        <aside className="proto-checkout-sidebar">
          <StorefrontCard className="proto-order-summary-card">
            <StorefrontSectionHeader
              title="Next Actions"
              description="Use these actions to complete payment, track the order, or contact support."
            />
            <div className="proto-checkout-stack">
              {paymentMethod === "online" && paymentStatus !== "paid" ? (
                paymentLink ? (
                  <StorefrontButton href={paymentLink} target="_blank" rel="noreferrer">
                    Continue to Payment
                  </StorefrontButton>
                ) : (
                  <StorefrontButton
                    type="button"
                    onClick={handleCreatePaymentLink}
                    disabled={paymentBusy}
                  >
                    {paymentBusy ? "Creating Payment Link..." : "Create Payment Link"}
                  </StorefrontButton>
                )
              ) : null}

              {isAuthenticated && effectiveOrderId ? (
                <StorefrontButton to={`/account/orders/${effectiveOrderId}`} variant="light">
                  View Order
                </StorefrontButton>
              ) : null}

              {showGuestFollowupLink ? (
                <StorefrontButton to={guestOrderLink} variant="light">
                  View Order Status
                </StorefrontButton>
              ) : null}

              {order?.invoice?.id ? (
                <StorefrontButton
                  type="button"
                  variant="light"
                  onClick={handleDownloadInvoice}
                >
                  Download Invoice
                </StorefrontButton>
              ) : (
                <StorefrontAlert>
                  Invoice is generated after payment confirmation and order processing.
                  Revisit this order link or contact support if you need it urgently.
                </StorefrontAlert>
              )}

              <StorefrontButton to="/products" variant="dark">
                Continue Shopping
              </StorefrontButton>

              {supportPhone ? (
                <StorefrontButton href={`tel:${supportPhone}`} variant="light">
                  Call Support
                </StorefrontButton>
              ) : null}

              {whatsappLink ? (
                <StorefrontButton
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  variant="whatsapp"
                >
                  WhatsApp Support
                </StorefrontButton>
              ) : null}
            </div>
          </StorefrontCard>
        </aside>
      </div>

      <StorefrontStickyActionBar className="proto-sticky-success-bar">
        <div>
          <span>Order</span>
          <strong>{effectiveOrderNo || "Confirmation saved"}</strong>
        </div>
        {canSubmitManualPayment ? (
          <StorefrontButton
            type="submit"
            form="guest-manual-payment-form"
            disabled={manualPaymentBusy}
          >
            {manualPaymentBusy ? "Submitting..." : "Submit Proof"}
          </StorefrontButton>
        ) : paymentMethod === "online" && paymentStatus !== "paid" ? (
          paymentLink ? (
            <StorefrontButton href={paymentLink} target="_blank" rel="noreferrer">
              Continue Payment
            </StorefrontButton>
          ) : (
            <StorefrontButton
              type="button"
              onClick={handleCreatePaymentLink}
              disabled={paymentBusy}
            >
              {paymentBusy ? "Creating..." : "Create Payment Link"}
            </StorefrontButton>
          )
        ) : isAuthenticated && effectiveOrderId ? (
          <StorefrontButton to={`/account/orders/${effectiveOrderId}`}>
            View Order
          </StorefrontButton>
        ) : showGuestFollowupLink ? (
          <StorefrontButton to={guestOrderLink}>View Order Status</StorefrontButton>
        ) : order?.invoice?.id ? (
          <StorefrontButton type="button" onClick={handleDownloadInvoice}>
            Download Invoice
          </StorefrontButton>
        ) : (
          <StorefrontButton to="/products">Continue Shopping</StorefrontButton>
        )}
      </StorefrontStickyActionBar>
    </main>
  );
}
