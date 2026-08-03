import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getCustomerAccountBootstrap, loginCustomerEmail } from "../account/account.api";
import { GoogleSignInButton } from "../account/account-login-page";
import { createCustomerSession, useCustomerSession } from "../../shared/auth/customer-session";
import { resetGuestSessionId } from "../../shared/cart/guest-session";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontEmptyState,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontSelect,
  StorefrontStickyActionBar
} from "../../shared/storefront/storefront-ui";
import { INDIA_GST_STATES } from "../../shared/india-gst-states";
import {
  addCartItem,
  cancelPaymentAttempt,
  confirmCashfreePayment,
  confirmRazorpayPayment,
  createPaymentAttempt,
  deleteCartItem,
  getCart,
  getCheckoutSession,
  getManualGatewayInfo,
  listOnlineGateways,
  mergeGuestCart,
  searchStorefront,
  startCheckout,
  updateCartItem
} from "../products/products.api";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function loadCashfreeScript() {
  return new Promise((resolve) => {
    if (window.Cashfree) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}
import {
  PAYMENT_METHOD_OPTIONS,
  SHIPPING_METHOD_OPTIONS,
  buildAddressPayload,
  buildCartContext,
  createAddressForm,
  formatCurrency,
  getExistingGuestSessionId,
  humanizeStatus,
  notifyStorefrontCartUpdated
} from "./cart.utils";
import { watchdog } from "../../shared/watchdog-client";
import { OrderDetailModal } from "./order-detail-modal";
import { CheckoutItemEditor } from "./checkout-item-editor";

const PAYMENT_DESCRIPTIONS = {
  online: "Credit/Debit card, UPI, and net banking through the online gateway.",
  direct_bank_transfer: "Manual verification with bank transfer details after checkout creation.",
  manual_upi: "Manual UPI transfer with offline verification after checkout creation."
};

const SHIPPING_DESCRIPTIONS = {
  standard: "Standard delivery for most domestic orders.",
  express: "Priority dispatch for faster delivery timelines.",
  local_pickup: "Pickup from the configured local collection point.",
  self_pickup: "Self pickup coordinated directly with the store team.",
  transport: "Transport booking for larger commercial shipments.",
  manual_delivery: "Manual delivery scheduled by the operations team."
};

function pickDefaultAddress(savedAddresses = []) {
  if (!Array.isArray(savedAddresses) || savedAddresses.length === 0) {
    return null;
  }

  return (
    savedAddresses.find((address) => address.isDefaultShipping) ||
    savedAddresses.find((address) => address.isDefaultBilling) ||
    savedAddresses[0]
  );
}

function seedCheckoutAddress(snapshot, customer) {
  const address = pickDefaultAddress(snapshot?.savedAddresses || []);
  return createAddressForm({
    companyName:
      snapshot?.profile?.companyName ||
      snapshot?.gstDetails?.businessName ||
      "",
    gstin: snapshot?.profile?.gstin || snapshot?.gstDetails?.gstin || "",
    name: address?.name || snapshot?.profile?.name || customer?.name || "",
    email: address?.email || snapshot?.profile?.email || customer?.email || "",
    mobile: address?.mobile || snapshot?.profile?.mobile || customer?.mobile || "",
    addressLine1: address?.addressLine1 || "",
    addressLine2: address?.addressLine2 || "",
    city: address?.city || "",
    state: address?.state || "",
    stateCode: address?.stateCode || "",
    pincode: address?.pincode || "",
    country: address?.country || "India"
  });
}

function addressFormsMatch(left = {}, right = {}) {
  const keys = [
    "companyName",
    "gstin",
    "name",
    "email",
    "mobile",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "stateCode",
    "pincode",
    "country"
  ];

  return keys.every(
    (key) => String(left[key] || "").trim() === String(right[key] || "").trim()
  );
}

function humanizeInstructionKey(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatAddressCard(address) {
  return [
    address?.addressLine1,
    address?.addressLine2,
    address?.city,
    address?.state,
    address?.pincode
  ]
    .filter(Boolean)
    .join(", ");
}

function buildOrderSuccessUrl({ sessionId, orderId, orderNo, paymentLink }) {
  const params = new URLSearchParams();

  if (sessionId) {
    params.set("session", sessionId);
  }
  if (orderId) {
    params.set("orderId", orderId);
  }
  if (orderNo) {
    params.set("orderNo", orderNo);
  }
  if (paymentLink) {
    params.set("paymentLink", paymentLink);
  }

  return `/checkout/success?${params.toString()}`;
}

// Shown before the checkout form for anyone not signed in — login is the primary
// path (like Flipkart/Myntra), guest checkout is a smaller secondary link below.
function CheckoutLoginGate({ onSignedIn, onContinueAsGuest, itemCount, grandTotal }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await loginCustomerEmail(form);
      onSignedIn(createCustomerSession(payload));
    } catch (requestError) {
      setError(requestError.message || "Sign in failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="proto-checkout-card proto-checkout-login-gate proto-login-gate-v2">
      <div className="proto-login-gate-badge" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <div className="proto-checkout-card-head">
        <h2>Sign in to check out</h2>
        <span>
          {itemCount} item{itemCount === 1 ? "" : "s"} · {formatCurrency(grandTotal)}
        </span>
      </div>

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}

      <GoogleSignInButton redirectPath="/checkout" />

      <div className="proto-login-gate-divider"><span>or sign in with email</span></div>

      <form className="stack-form" onSubmit={handleLogin}>
        <div className="field-grid">
          <StorefrontInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="name@example.com"
            required
          />
          <StorefrontInput
            label="Password"
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Your password"
            required
          />
        </div>
        <button type="submit" className="proto-login-gate-btn proto-btn proto-btn-primary" disabled={busy}>
          {busy ? "Signing in..." : "Login & Continue"}
        </button>
      </form>

      <StorefrontButton
        to="/account/login?redirect=%2Fcheckout"
        variant="light"
        className="proto-login-gate-btn"
      >
        New here? Create Account
      </StorefrontButton>

      <div className="proto-login-gate-divider"><span>or</span></div>

      <button type="button" className="proto-login-gate-btn proto-btn proto-btn-light" onClick={onContinueAsGuest}>
        Continue as Guest →
      </button>
    </article>
  );
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { customer, isAuthenticated, loading: sessionLoading, setSession } = useCustomerSession();
  // Skip the login gate when resuming an existing checkout session (e.g. a retry
  // link) — they've already been through this decision once for this checkout.
  const [guestOverride, setGuestOverride] = useState(
    () => new URLSearchParams(window.location.search).has("session")
  );
  // Step 1 (Address) / 2 (Shipping & Payment) / 3 (Review & Place). Advances
  // automatically as each step's own "Continue" button is pressed (validating
  // only that step's fields via the browser's own required/format checks), but
  // a completed step stays tappable — its collapsed summary has an Edit action
  // that jumps activeStep back without losing anything already unlocked ahead.
  const [activeStep, setActiveStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const formRef = useRef(null);
  const skipFirstScrollRef = useRef(true);

  // Advancing (or jumping back to Edit) a step changes what's expanded, which
  // changes the page's total height — without this, a buyer scrolled down
  // into a long step just sees blank space (or an unrelated part of the
  // page) after the content above them collapses, and it looks like nothing
  // happened when the step actually did change.
  useEffect(() => {
    if (skipFirstScrollRef.current) {
      skipFirstScrollRef.current = false;
      return;
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeStep]);
  const [orderDetailModalOpen, setOrderDetailModalOpen] = useState(false);
  const [reviewItemsBusy, setReviewItemsBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cart, setCart] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("online");
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [billingForm, setBillingForm] = useState(() => createAddressForm());
  const [shippingForm, setShippingForm] = useState(() => createAddressForm());
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [checkoutSession, setCheckoutSession] = useState(null);
  const [orderSummary, setOrderSummary] = useState(null);
  const [manualPaymentInstructions, setManualPaymentInstructions] = useState(null);
  const [gatewayInfo, setGatewayInfo] = useState(null);
  const [paymentAttempt, setPaymentAttempt] = useState(null);
  const [onlineGateways, setOnlineGateways] = useState([]);
  const [selectedOnlineGateway, setSelectedOnlineGateway] = useState("");

  const restoredCheckoutSessionId = searchParams.get("session") || "";
  const effectiveShippingForm = useMemo(
    () => (sameAsBilling ? billingForm : shippingForm),
    [billingForm, sameAsBilling, shippingForm]
  );

  const totals = useMemo(() => {
    const pricing = cart?.pricing || {};
    return {
      itemCount: Number(cart?.itemCount || 0),
      productSubtotal: Number(pricing.productSubtotal || 0),
      taxableValue: Number(pricing.taxableValue || 0),
      discountAmount: Number(pricing.discountAmount || 0),
      gstTotal: Number(pricing.gstTotal || 0),
      shippingCharge: Number(pricing.shippingCharge || 0),
      grandTotal: Number(pricing.grandTotal || 0)
    };
  }, [cart]);

  function resolveCartContext(createIfMissing = true) {
    if (isAuthenticated) {
      return {};
    }

    const existingGuestSessionId = getExistingGuestSessionId();
    if (existingGuestSessionId) {
      return { sessionId: existingGuestSessionId };
    }

    if (!createIfMissing) {
      return null;
    }

    return buildCartContext(false);
  }

  async function refreshCartPreview() {
    const context = resolveCartContext(true) || {};
    const nextCart = await getCart({
      ...context,
      paymentMethod,
      shippingMethod,
      shippingPincode: effectiveShippingForm.pincode,
      shippingStateCode: effectiveShippingForm.stateCode,
      shippingState: effectiveShippingForm.state
    });
    setCart(nextCart);
    return nextCart;
  }

  async function restoreCheckoutSession(checkoutSessionId) {
    if (!checkoutSessionId) {
      return;
    }

    const context = resolveCartContext(false);
    if (!isAuthenticated && !context?.sessionId) {
      setNotice(
        "Saved checkout session could not be restored because the guest browser session is no longer available."
      );
      return;
    }

    const session = await getCheckoutSession(checkoutSessionId, context || {});
    setCheckoutSession(session);
    setPaymentMethod(session.paymentMethod || "online");
    setShippingMethod(session.shippingMethod || "standard");

    const nextBilling = createAddressForm(session.billingAddress || {});
    const nextShipping = createAddressForm(session.shippingAddress || {});
    setBillingForm(nextBilling);
    setShippingForm(nextShipping);
    setSameAsBilling(addressFormsMatch(nextBilling, nextShipping));
  }

  useEffect(() => {
    if (sessionLoading) {
      return undefined;
    }

    let active = true;

    const bootstrap = async () => {
      setLoading(true);
      setError("");

      try {
        let mergedCart = null;
        let mergedNotice = "";

        if (isAuthenticated) {
          const guestSessionId = getExistingGuestSessionId();
          if (guestSessionId) {
            const merged = await mergeGuestCart(guestSessionId);
            if (merged?.merged) {
              resetGuestSessionId();
              mergedCart = merged.cart || null;
              mergedNotice = "Guest cart merged into your customer cart.";
              notifyStorefrontCartUpdated();
            }
          }
        }

        const [snapshot, cartData] = await Promise.all([
          isAuthenticated ? getCustomerAccountBootstrap(2) : Promise.resolve(null),
          mergedCart ? Promise.resolve(mergedCart) : refreshCartPreview()
        ]);

        if (!active) {
          return;
        }

        if (snapshot) {
          const seededAddress = seedCheckoutAddress(snapshot, customer);
          const defaultSavedAddress = pickDefaultAddress(snapshot?.savedAddresses || []);
          setSavedAddresses(Array.isArray(snapshot?.savedAddresses) ? snapshot.savedAddresses : []);
          setSelectedAddressId(defaultSavedAddress?.id || "");
          setBillingForm(seededAddress);
          setShippingForm(seededAddress);
        }

        if (mergedNotice) {
          setNotice(mergedNotice);
        }

        setCart(cartData);
        watchdog.trackCheckoutStarted(cartData?.id);

        if (restoredCheckoutSessionId) {
          try {
            await restoreCheckoutSession(restoredCheckoutSessionId);
          } catch (requestError) {
            if (active) {
              setNotice(
                requestError.message ||
                  "Saved checkout session could not be restored. Submit checkout again to continue."
              );
            }
          }
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message || "Failed to load checkout.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, [
    customer?.email,
    customer?.mobile,
    customer?.name,
    isAuthenticated,
    restoredCheckoutSessionId,
    sessionLoading
  ]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    const handle = window.setTimeout(() => {
      setPreviewLoading(true);
      refreshCartPreview()
        .catch(() => {
          // Keep the last good preview visible if a refresh fails.
        })
        .finally(() => {
          setPreviewLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(handle);
    };
  }, [
    effectiveShippingForm.pincode,
    effectiveShippingForm.state,
    effectiveShippingForm.stateCode,
    loading,
    paymentMethod,
    shippingMethod
  ]);

  useEffect(() => {
    if (paymentMethod === "online") {
      setGatewayInfo(null);
      return undefined;
    }

    let active = true;
    getManualGatewayInfo(paymentMethod)
      .then((data) => {
        if (active) {
          setGatewayInfo(data || null);
        }
      })
      .catch(() => {
        // show fallback text if fetch fails
      });

    return () => {
      active = false;
    };
  }, [paymentMethod]);

  useEffect(() => {
    let active = true;
    listOnlineGateways()
      .then((rows) => {
        if (!active) return;
        const gateways = Array.isArray(rows) ? rows : [];
        setOnlineGateways(gateways);
        setSelectedOnlineGateway((current) =>
          gateways.some((g) => g.code === current) ? current : gateways[0]?.code || ""
        );
      })
      .catch(() => {
        // fall back to backend's default gateway selection if this fails
      });
    return () => {
      active = false;
    };
  }, []);

  // Validates only whatever step 1's inputs are currently mounted (step 2/3
  // fields aren't in the DOM yet at this point, so reportValidity() can't see
  // or block on them) before collapsing step 1 and unlocking step 2.
  function goToStep(stepNumber) {
    if (formRef.current && stepNumber > activeStep && !formRef.current.reportValidity()) {
      setError("Please complete the required fields above before continuing.");
      return;
    }
    setError("");
    setActiveStep(stepNumber);
    setMaxStepReached((current) => Math.max(current, stepNumber));
  }

  function addressStepSummary() {
    const parts = [billingForm.name, billingForm.addressLine1, billingForm.city, billingForm.pincode].filter(Boolean);
    return parts.join(", ") || "Address not yet entered";
  }

  function shippingPaymentStepSummary() {
    const shippingLabel = SHIPPING_METHOD_OPTIONS.find((option) => option.value === shippingMethod)?.label || shippingMethod;
    const paymentLabel = PAYMENT_METHOD_OPTIONS.find((option) => option.value === paymentMethod)?.label || paymentMethod;
    return `${shippingLabel} · ${paymentLabel}`;
  }

  async function handleRefreshTotals() {
    setPreviewLoading(true);
    setError("");

    try {
      await refreshCartPreview();
    } catch (requestError) {
      setError(requestError.message || "Failed to refresh cart totals.");
    } finally {
      setPreviewLoading(false);
    }
  }

  // All three below write straight to the server cart, then re-fetch it —
  // never just patch local state optimistically. That re-fetch is what
  // keeps `cart.updatedAt` (sent as expectedCartUpdatedAt on submit) honest:
  // whatever this tab did last is what's reflected, and if a second tab
  // changed the same cart in between, the existing "cart changed since this
  // tab last loaded it" 409 guard on submit already catches that — nothing
  // new needed there, this just makes sure THIS tab's edits are the ones
  // actually recorded rather than a stale in-memory copy.
  async function handleReviewQtyChange(productId, nextQty) {
    if (nextQty < 1) {
      return;
    }
    setReviewItemsBusy(true);
    setError("");
    try {
      await updateCartItem(productId, { qty: nextQty });
      await refreshCartPreview();
      notifyStorefrontCartUpdated();
    } catch (requestError) {
      setError(requestError.message || "Failed to update quantity.");
    } finally {
      setReviewItemsBusy(false);
    }
  }

  async function handleReviewRemoveItem(productId) {
    setReviewItemsBusy(true);
    setError("");
    try {
      await deleteCartItem(productId);
      await refreshCartPreview();
      notifyStorefrontCartUpdated();
    } catch (requestError) {
      setError(requestError.message || "Failed to remove item.");
    } finally {
      setReviewItemsBusy(false);
    }
  }

  async function handleReviewAddProduct(product) {
    setReviewItemsBusy(true);
    setError("");
    try {
      await addCartItem({ ...buildCartContext(isAuthenticated), productId: product.id, qty: 1 });
      await refreshCartPreview();
      notifyStorefrontCartUpdated();
      setNotice(`${product.title} added to cart.`);
    } catch (requestError) {
      setError(requestError.message || "Failed to add product.");
    } finally {
      setReviewItemsBusy(false);
    }
  }

  // Fire-and-forget: releases the stock reservation tied to an abandoned/cancelled
  // payment attempt right away, instead of leaving it held until its ~15min TTL
  // expires. Without this, retrying a low-stock item right after cancelling gets
  // wrongly rejected as "not available" — blocked by the buyer's own abandoned hold.
  function releaseAbandonedAttempt(attemptId) {
    if (!attemptId) return;
    const context = resolveCartContext(false);
    if (!isAuthenticated && !context?.sessionId) return;
    cancelPaymentAttempt({ ...(context || {}), attemptId }).catch(() => {
      // best-effort — natural TTL expiry is still a fallback
    });
  }

  async function handleCreatePaymentLink(checkoutSessionId) {
    const context = resolveCartContext(false);
    if (!isAuthenticated && !context?.sessionId) {
      setError("Guest checkout session is missing. Restart checkout from the cart.");
      return;
    }

    setPaymentBusy(true);
    setError("");
    setNotice("");

    try {
      const attempt = await createPaymentAttempt({
        ...(context || {}),
        checkoutSessionId,
        ...(selectedOnlineGateway ? { gateway: selectedOnlineGateway } : {})
      });
      watchdog.trackPaymentInitiated(cart?.id, attempt?.id);
      setPaymentAttempt(attempt);
      setCheckoutSession((current) =>
        current
          ? {
              ...current,
              status: "payment_attempt_created"
            }
          : current
      );
      setNotice("Payment link created. Continue to the online gateway.");
      return attempt;
    } catch (requestError) {
      setError(requestError.message || "Failed to create payment link.");
    } finally {
      setPaymentBusy(false);
    }

    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setError("");
    setNotice("");
    setPaymentAttempt(null);
    setManualPaymentInstructions(null);
    setOrderSummary(null);

    try {
      const context = resolveCartContext(true) || {};
      const response = await startCheckout({
        ...context,
        paymentMethod,
        shippingMethod,
        billingAddress: buildAddressPayload(billingForm),
        shippingAddress: buildAddressPayload(effectiveShippingForm),
        // Ties this submission to the exact cart this tab last displayed, so a
        // cart mutated from another tab (same guest/customer session) can't silently
        // get ordered instead of what was reviewed and confirmed here.
        expectedCartUpdatedAt: cart?.updatedAt || null,
        newsletterSubscribed
      });

      const nextCheckoutSession = response.checkoutSession || null;
      const nextOrderSummary = response.order || null;
      const nextManualInstructions = response.manualPaymentInstructions || null;
      watchdog.trackAddressSubmitted(cart?.id);
      setCheckoutSession(nextCheckoutSession);
      setOrderSummary(nextOrderSummary);
      setManualPaymentInstructions(nextManualInstructions);

      if (nextCheckoutSession?.id) {
        setSearchParams({ session: nextCheckoutSession.id }, { replace: true });
      }

      const openOrderSuccess = (attempt = null) => {
        if (!nextCheckoutSession?.id) {
          return;
        }

        navigate(
          buildOrderSuccessUrl({
            sessionId: nextCheckoutSession.id,
            orderId: nextOrderSummary?.id || nextCheckoutSession.orderId || "",
            orderNo: nextOrderSummary?.orderNo || "",
            paymentLink: attempt?.gatewayPaymentLink || ""
          }),
          {
            replace: true,
            state: {
              manualPaymentInstructions: nextManualInstructions,
              paymentAttempt: attempt,
              orderSummary: nextOrderSummary
            }
          }
        );
      };

      if (response.checkoutBlocked) {
        setNotice(
          `Quote request created. Reference ${response.quoteRequestId || nextCheckoutSession?.quoteRequestId || "saved"}.`
        );
        openOrderSuccess();
        return;
      }

      if (paymentMethod === "online" && nextCheckoutSession?.id) {
        const attempt = await handleCreatePaymentLink(nextCheckoutSession.id);
        if (!attempt) {
          // The checkout session was created but the payment attempt (stock
          // reservation) wasn't — clear it instead of leaving a "Latest
          // Checkout Session" card with a Create Payment Link button sitting
          // right next to the error, which looked like a live retry option
          // when the same request would just fail again.
          setCheckoutSession(null);
          setOrderSummary(null);
          setSearchParams({}, { replace: true });
          refreshCartPreview().catch(() => {});
          return;
        }

        if (attempt.gateway === "razorpay" && attempt.gatewayOrderId && attempt.gatewayProviderKey) {
          const loaded = await loadRazorpayScript();
          if (!loaded) {
            setError("Failed to load payment gateway. Please check your internet connection and try again.");
            setSubmitting(false);
            return;
          }

          const rzpOptions = {
            key: attempt.gatewayProviderKey,
            order_id: attempt.gatewayOrderId,
            amount: Math.round(Number(attempt.amount || 0) * 100),
            currency: "INR",
            name: "Jenix India",
            description: `Order ${nextOrderSummary?.orderNo || nextCheckoutSession.id}`,
            theme: { color: "#E8231A" },
            prefill: {
              name: billingForm.name || "",
              email: billingForm.email || "",
              contact: billingForm.mobile || ""
            },
            handler: async function (rzpResponse) {
              // Payment succeeded — confirm with backend then go to success page
              try {
                await confirmRazorpayPayment({
                  attemptId: attempt.attemptId,
                  razorpay_payment_id: rzpResponse.razorpay_payment_id,
                  razorpay_order_id: rzpResponse.razorpay_order_id,
                  razorpay_signature: rzpResponse.razorpay_signature
                });
              } catch (_confirmErr) {
                // Non-fatal: webhook will also process it
              }
              openOrderSuccess(attempt);
            },
            modal: {
              ondismiss: function () {
                releaseAbandonedAttempt(attempt.attemptId);
                setError("Payment was not completed. You can try again.");
                setSubmitting(false);
              }
            }
          };

          const rzp = new window.Razorpay(rzpOptions);
          rzp.on("payment.failed", function (resp) {
            releaseAbandonedAttempt(attempt.attemptId);
            setError(`Payment failed: ${resp.error?.description || "Please try again."}`);
            setSubmitting(false);
          });
          rzp.open();
          return; // Navigation handled by the modal handler callback above
        }

        if (attempt.gateway === "cashfree" && attempt.gatewayPaymentSessionId) {
          const loaded = await loadCashfreeScript();
          if (!loaded || !window.Cashfree) {
            setError("Failed to load payment gateway. Please check your internet connection and try again.");
            setSubmitting(false);
            return;
          }

          try {
            const cashfree = new window.Cashfree({
              mode: attempt.gatewayMode === "live" ? "production" : "sandbox"
            });
            const result = await cashfree.checkout({
              paymentSessionId: attempt.gatewayPaymentSessionId,
              redirectTarget: "_modal"
            });

            if (!result?.paymentDetails) {
              releaseAbandonedAttempt(attempt.attemptId);
              setError(
                result?.error?.message || "Payment was not completed. You can try again."
              );
              setSubmitting(false);
              return;
            }

            try {
              await confirmCashfreePayment({ attemptId: attempt.attemptId });
            } catch (_confirmErr) {
              // Non-fatal: webhook (once configured) will also process it
            }
            openOrderSuccess(attempt);
          } catch (cashfreeError) {
            releaseAbandonedAttempt(attempt.attemptId);
            setError(cashfreeError.message || "Payment failed. Please try again.");
            setSubmitting(false);
          }
          return;
        }

        // Fallback if no usable gateway session (e.g. unconfigured gateway)
        openOrderSuccess(attempt);
      } else {
        setNotice(
          `Checkout created${response.order?.orderNo ? ` for order ${response.order.orderNo}` : ""}.`
        );
        openOrderSuccess();
        refreshCartPreview().catch(() => {});
      }
    } catch (requestError) {
      setError(requestError.message || "Checkout could not be started.");
      if (requestError.status === 409) {
        // Cart changed since this tab last loaded it — refresh the on-screen summary
        // so the buyer reviews the current items before trying to place the order again.
        refreshCartPreview().catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionLoading || loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading checkout..." />
      </main>
    );
  }

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const manualInstructionEntries = Object.entries(
    manualPaymentInstructions?.instructions || gatewayInfo?.instructions || {}
  ).filter(([, value]) => Boolean(value));

  if (!isAuthenticated && !guestOverride && items.length > 0) {
    return (
      <main className="proto-main-shell proto-checkout-page">
        <StorefrontPageHeader
          eyebrow="Checkout"
          title="Sign in to check out faster"
          description="Track this order, save your address, and reorder in one click by signing in — or continue as a guest."
          actions={<StorefrontButton to="/cart" variant="light">Back to Cart</StorefrontButton>}
        />
        <div className="proto-checkout-layout">
          <section className="proto-checkout-main">
            <CheckoutLoginGate
              itemCount={items.length}
              grandTotal={totals.grandTotal}
              onSignedIn={(session) => {
                setSession(session);
              }}
              onContinueAsGuest={() => setGuestOverride(true)}
            />
          </section>
          <aside className="proto-checkout-sidebar">
            <article className="proto-order-summary-card">
              <button type="button" className="proto-order-summary-heading-btn" onClick={() => setOrderDetailModalOpen(true)}>
                <h2>Order Summary</h2>
                <span>View details ›</span>
              </button>
              <div className="proto-checkout-items">
                {items.map((item) => (
                  <div key={item.productId} className="proto-checkout-item">
                    <div className="proto-checkout-item-media">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} loading="lazy" />
                      ) : (
                        <span>{item.sku || "Jenix"}</span>
                      )}
                    </div>
                    <div className="proto-checkout-item-copy">
                      <p>{item.title}</p>
                      <span>Qty {Number(item.qty || 0)}</span>
                      <strong>{formatCurrency(item.lineTotal)}</strong>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="proto-summary-total proto-summary-total-btn" onClick={() => setOrderDetailModalOpen(true)}>
                <span>Grand Total</span>
                <strong>{formatCurrency(totals.grandTotal)}</strong>
                <small>inclusive of all taxes · tap to view breakdown</small>
              </button>
            </article>
          </aside>
        </div>
        <OrderDetailModal
          open={orderDetailModalOpen}
          onClose={() => setOrderDetailModalOpen(false)}
          items={items}
          pricing={cart?.pricing || {}}
        />
      </main>
    );
  }

  return (
    <main className="proto-main-shell proto-checkout-page">
      <StorefrontPageHeader
        eyebrow="Checkout"
        title="Delivery, Payment, and Review"
        description={`Confirm address, shipping, and payment for ${items.length} item${items.length === 1 ? "" : "s"} before placing the order.`}
        actions={<StorefrontButton to="/cart" variant="light">Back to Cart</StorefrontButton>}
      />

      <div className="proto-checkout-steps">
        {[
          { n: 1, label: "Delivery Address" },
          { n: 2, label: "Shipping Method" },
          { n: 3, label: "Payment Method" },
          { n: 4, label: "Review & Place" }
        ].map((step, index) => (
          <div key={step.n} style={{ display: "contents" }}>
            {index > 0 ? <div className="proto-step-connector" /> : null}
            <button
              type="button"
              className={step.n === activeStep ? "active" : step.n < activeStep ? "done" : ""}
              disabled={step.n > maxStepReached}
              onClick={() => goToStep(step.n)}
            >
              <span>{step.n < activeStep ? "✓" : step.n}</span>
              <strong>{step.label}</strong>
            </button>
          </div>
        ))}
      </div>

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <div className="proto-checkout-layout">
        <section className="proto-checkout-main">
          {/* Suppressed while auto-redirecting to an online gateway right after
              submit — otherwise this flashes on screen for a moment before the
              Razorpay/Cashfree widget opens, which is just noise for the buyer. */}
          {checkoutSession && !(submitting && paymentMethod === "online") ? (
            <article className="proto-checkout-card">
              <div className="proto-checkout-card-head">
                <h2>Latest Checkout Session</h2>
              </div>
              <div className="proto-summary-rows proto-summary-rows-compact">
                <div><span>Session</span><strong>{checkoutSession.id}</strong></div>
                <div><span>Status</span><strong>{humanizeStatus(checkoutSession.status)}</strong></div>
                <div><span>Payment</span><strong>{humanizeStatus(checkoutSession.paymentMethod)}</strong></div>
                <div><span>Shipping</span><strong>{humanizeStatus(checkoutSession.shippingMethod)}</strong></div>
              </div>
              <div className="proto-inline-actions">
                {checkoutSession.paymentMethod === "online" ? (
                  <StorefrontButton
                    type="button"
                    onClick={() => handleCreatePaymentLink(checkoutSession.id)}
                    disabled={paymentBusy}
                  >
                    {paymentBusy ? "Creating..." : "Create Payment Link"}
                  </StorefrontButton>
                ) : null}
                {paymentAttempt?.gatewayPaymentLink ? (
                  <StorefrontButton
                    href={paymentAttempt.gatewayPaymentLink}
                    target="_blank"
                    rel="noreferrer"
                    variant="light"
                  >
                    Open Payment Link
                  </StorefrontButton>
                ) : null}
                {isAuthenticated && (orderSummary?.id || checkoutSession.orderId) ? (
                  <StorefrontButton
                    to={`/account/orders/${orderSummary?.id || checkoutSession.orderId}`}
                    variant="light"
                  >
                    View Order
                  </StorefrontButton>
                ) : null}
              </div>
            </article>
          ) : null}

          {items.length === 0 && !checkoutSession ? (
            <article className="proto-checkout-card">
              <StorefrontEmptyState
                title="Your cart is empty"
                description="Add at least one product before starting checkout."
                action={<StorefrontButton to="/products" variant="light">Browse Products</StorefrontButton>}
              />
            </article>
          ) : (
            <form id="checkout-form" className="proto-checkout-stack" onSubmit={handleSubmit} ref={formRef}>
              {activeStep !== 1 ? (
                <div className="proto-step-summary-card">
                  <div>
                    <div className="proto-step-summary-title"><span className="check">✓</span>Delivery Address</div>
                    <p>{addressStepSummary()}</p>
                  </div>
                  <button type="button" className="proto-step-edit-btn" onClick={() => goToStep(1)}>Edit</button>
                </div>
              ) : null}

              <article className="proto-checkout-card" hidden={activeStep !== 1} style={activeStep !== 1 ? { display: "none" } : undefined}>
                <div className="proto-checkout-card-head">
                  <h2>Delivery Address</h2>
                  {!isAuthenticated ? <span>Guest checkout</span> : null}
                </div>

                {savedAddresses.length > 0 ? (
                  <div className="proto-address-grid">
                    {savedAddresses.map((address) => (
                      <label
                        key={address.id}
                        className={`proto-address-card${selectedAddressId === address.id ? " active" : ""}`}
                      >
                        <input
                          type="radio"
                          name="savedAddress"
                          checked={selectedAddressId === address.id}
                          onChange={() => {
                            const nextAddress = createAddressForm({
                              companyName: billingForm.companyName,
                              gstin: billingForm.gstin,
                              name: address.name,
                              email: address.email,
                              mobile: address.mobile,
                              addressLine1: address.addressLine1,
                              addressLine2: address.addressLine2,
                              city: address.city,
                              state: address.state,
                              stateCode: address.stateCode,
                              pincode: address.pincode,
                              country: address.country || "India"
                            });
                            setSelectedAddressId(address.id);
                            setBillingForm(nextAddress);
                            setShippingForm(nextAddress);
                            setSameAsBilling(true);
                          }}
                        />
                        <div>
                          <strong>{address.name || "Saved address"}</strong>
                          <p>{formatAddressCard(address)}</p>
                          <small>{address.mobile || address.email || ""}</small>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : null}

                <div className="proto-form-grid">
                  <StorefrontInput
                    label="Contact Name"
                    value={billingForm.name}
                    onChange={(event) => setBillingForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Contact Name"
                    required
                  />
                  <StorefrontInput
                    label="Company Name (optional)"
                    value={billingForm.companyName}
                    onChange={(event) => setBillingForm((current) => ({ ...current, companyName: event.target.value }))}
                    placeholder="Company Name"
                  />
                  <StorefrontInput
                    label="GSTIN (optional)"
                    value={billingForm.gstin}
                    onChange={(event) => setBillingForm((current) => ({ ...current, gstin: event.target.value }))}
                    placeholder="GSTIN"
                  />
                  <StorefrontInput
                    label="Mobile"
                    value={billingForm.mobile}
                    onChange={(event) => setBillingForm((current) => ({ ...current, mobile: event.target.value }))}
                    placeholder="Mobile"
                    required
                  />
                  <StorefrontInput
                    label="Email"
                    type="email"
                    value={billingForm.email}
                    onChange={(event) => setBillingForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="Email"
                    required
                  />
                  <StorefrontInput
                    label="Country"
                    value={billingForm.country}
                    onChange={(event) => setBillingForm((current) => ({ ...current, country: event.target.value }))}
                    placeholder="Country"
                    required
                  />
                  <StorefrontInput
                    label="Address Line 1"
                    fieldClassName="wide"
                    value={billingForm.addressLine1}
                    onChange={(event) => setBillingForm((current) => ({ ...current, addressLine1: event.target.value }))}
                    placeholder="Address Line 1"
                    required
                  />
                  <StorefrontInput
                    label="Address Line 2"
                    fieldClassName="wide"
                    value={billingForm.addressLine2}
                    onChange={(event) => setBillingForm((current) => ({ ...current, addressLine2: event.target.value }))}
                    placeholder="Address Line 2"
                  />
                  <StorefrontInput
                    label="City"
                    value={billingForm.city}
                    onChange={(event) => setBillingForm((current) => ({ ...current, city: event.target.value }))}
                    placeholder="City"
                    required
                  />
                  <StorefrontSelect
                    label="State"
                    value={billingForm.stateCode}
                    onChange={(event) => {
                      const nextState = INDIA_GST_STATES.find((row) => row.code === event.target.value);
                      setBillingForm((current) => ({
                        ...current,
                        stateCode: nextState?.code || "",
                        state: nextState?.name || ""
                      }));
                    }}
                    required
                  >
                    <option value="">Select state</option>
                    {INDIA_GST_STATES.map((row) => (
                      <option key={row.code} value={row.code}>{row.name}</option>
                    ))}
                  </StorefrontSelect>
                  <StorefrontInput
                    label="Pincode"
                    value={billingForm.pincode}
                    onChange={(event) => setBillingForm((current) => ({ ...current, pincode: event.target.value.replace(/[^\d]/g, "").slice(0, 6) }))}
                    placeholder="Pincode"
                    required
                  />
                </div>

                <label className="proto-check-option">
                  <input
                    type="checkbox"
                    checked={sameAsBilling}
                    onChange={(event) => setSameAsBilling(event.target.checked)}
                  />
                  <span>Shipping address is the same as billing</span>
                </label>

                <label className="proto-check-option">
                  <input
                    type="checkbox"
                    checked={newsletterSubscribed}
                    onChange={(event) => setNewsletterSubscribed(event.target.checked)}
                  />
                  <span>Keep me updated with offers and new products</span>
                </label>

                {!sameAsBilling ? (
                  <div className="proto-form-grid">
                    <StorefrontInput
                      label="Shipping Contact Name"
                      value={shippingForm.name}
                      onChange={(event) => setShippingForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Shipping Contact Name"
                      required
                    />
                    <StorefrontInput
                      label="Shipping Mobile"
                      value={shippingForm.mobile}
                      onChange={(event) => setShippingForm((current) => ({ ...current, mobile: event.target.value }))}
                      placeholder="Shipping Mobile"
                      required
                    />
                    <StorefrontInput
                      label="Shipping Address Line 1"
                      fieldClassName="wide"
                      value={shippingForm.addressLine1}
                      onChange={(event) => setShippingForm((current) => ({ ...current, addressLine1: event.target.value }))}
                      placeholder="Shipping Address Line 1"
                      required
                    />
                    <StorefrontInput
                      label="Shipping Address Line 2"
                      fieldClassName="wide"
                      value={shippingForm.addressLine2}
                      onChange={(event) => setShippingForm((current) => ({ ...current, addressLine2: event.target.value }))}
                      placeholder="Shipping Address Line 2"
                    />
                    <StorefrontInput
                      label="Shipping City"
                      value={shippingForm.city}
                      onChange={(event) => setShippingForm((current) => ({ ...current, city: event.target.value }))}
                      placeholder="Shipping City"
                      required
                    />
                    <StorefrontSelect
                      label="Shipping State"
                      value={shippingForm.stateCode}
                      onChange={(event) => {
                        const nextState = INDIA_GST_STATES.find((row) => row.code === event.target.value);
                        setShippingForm((current) => ({
                          ...current,
                          stateCode: nextState?.code || "",
                          state: nextState?.name || ""
                        }));
                      }}
                      required
                    >
                      <option value="">Select state</option>
                      {INDIA_GST_STATES.map((row) => (
                        <option key={row.code} value={row.code}>{row.name}</option>
                      ))}
                    </StorefrontSelect>
                    <StorefrontInput
                      label="Shipping Pincode"
                      value={shippingForm.pincode}
                      onChange={(event) => setShippingForm((current) => ({ ...current, pincode: event.target.value.replace(/[^\d]/g, "").slice(0, 6) }))}
                      placeholder="Shipping Pincode"
                      required
                    />
                  </div>
                ) : null}

                <div className="proto-inline-actions">
                  <button type="button" className="proto-login-gate-btn proto-btn proto-btn-primary" style={{ width: "auto", padding: "0 24px" }} onClick={() => goToStep(2)}>
                    Continue to Shipping →
                  </button>
                </div>
              </article>

              {activeStep > 2 ? (
                <div className="proto-step-summary-card">
                  <div>
                    <div className="proto-step-summary-title"><span className="check">✓</span>Shipping Method</div>
                    <p>{SHIPPING_METHOD_OPTIONS.find((option) => option.value === shippingMethod)?.label || shippingMethod}</p>
                  </div>
                  <button type="button" className="proto-step-edit-btn" onClick={() => goToStep(2)}>Edit</button>
                </div>
              ) : null}
              {activeStep === 1 ? (
                <div className="proto-step-locked-row">
                  <span>2</span> Shipping Method — complete delivery address first
                </div>
              ) : null}

              <article className="proto-checkout-card" hidden={activeStep !== 2} style={activeStep !== 2 ? { display: "none" } : undefined}>
                <div className="proto-checkout-card-head">
                  <h2>Shipping Method</h2>
                </div>
                <div className="proto-option-stack">
                  {SHIPPING_METHOD_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`proto-choice-card${shippingMethod === option.value ? " active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="shippingMethod"
                        checked={shippingMethod === option.value}
                        onChange={() => setShippingMethod(option.value)}
                      />
                      <div>
                        <strong>{option.label}</strong>
                        <p>{SHIPPING_DESCRIPTIONS[option.value] || "Shipping method configured in admin."}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="proto-inline-actions">
                  <button type="button" className="proto-login-gate-btn proto-btn proto-btn-primary" style={{ width: "auto", padding: "0 24px" }} onClick={() => goToStep(3)}>
                    Continue to Payment →
                  </button>
                </div>
              </article>

              {activeStep > 3 ? (
                <div className="proto-step-summary-card">
                  <div>
                    <div className="proto-step-summary-title"><span className="check">✓</span>Payment Method</div>
                    <p>{PAYMENT_METHOD_OPTIONS.find((option) => option.value === paymentMethod)?.label || paymentMethod}</p>
                  </div>
                  <button type="button" className="proto-step-edit-btn" onClick={() => goToStep(3)}>Edit</button>
                </div>
              ) : null}
              {activeStep < 2 ? (
                <div className="proto-step-locked-row">
                  <span>3</span> Payment Method — complete shipping method first
                </div>
              ) : null}

              <article className="proto-checkout-card" hidden={activeStep !== 3} style={activeStep !== 3 ? { display: "none" } : undefined}>
                <div className="proto-checkout-card-head">
                  <h2>Payment Method</h2>
                </div>
                <div className="proto-option-stack">
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`proto-choice-card${paymentMethod === option.value ? " active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={paymentMethod === option.value}
                        onChange={() => setPaymentMethod(option.value)}
                      />
                      <div>
                        <strong>{option.label}</strong>
                        <p>{PAYMENT_DESCRIPTIONS[option.value] || "Payment method configured in admin."}</p>
                        {option.value === "direct_bank_transfer" ? (
                          <span className="proto-discount-chip">Get 2% discount when pay by direct bank transfer</span>
                        ) : null}
                        {option.value === "manual_upi" ? (
                          <span className="proto-discount-chip">Get 2% discount when pay by manual UPI</span>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>

                {paymentMethod === "online" && onlineGateways.length > 1 ? (
                  <div className="proto-option-stack proto-gateway-stack">
                    <p className="proto-gateway-stack-label">Choose payment gateway</p>
                    {onlineGateways.map((gateway) => (
                      <label
                        key={gateway.code}
                        className={`proto-choice-card${selectedOnlineGateway === gateway.code ? " active" : ""}`}
                      >
                        <input
                          type="radio"
                          name="onlineGateway"
                          checked={selectedOnlineGateway === gateway.code}
                          onChange={() => setSelectedOnlineGateway(gateway.code)}
                        />
                        <div>
                          <strong>{gateway.label}</strong>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : null}

                {paymentMethod !== "online" ? (
                  <div className="proto-manual-payment-card">
                    {manualInstructionEntries.length > 0 ? (
                      <>
                        <p>Transfer to the details below, then upload your payment screenshot on the confirmation page.</p>
                        <div className="proto-summary-rows proto-summary-rows-compact">
                          {manualInstructionEntries.map(([key, value]) => (
                            <div key={key}>
                              <span>{humanizeInstructionKey(key)}</span>
                              <strong>{String(value)}</strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p>Place your order — bank / UPI details and payment upload will appear on the confirmation page.</p>
                    )}
                  </div>
                ) : null}

                <div className="proto-inline-actions">
                  <button type="button" className="proto-login-gate-btn proto-btn proto-btn-primary" style={{ width: "auto", padding: "0 24px" }} onClick={() => goToStep(4)}>
                    Continue to Review →
                  </button>
                </div>
              </article>

              {activeStep < 4 ? (
                <div className="proto-step-locked-row">
                  <span>4</span> Review &amp; Place — complete the steps above first
                </div>
              ) : (
                <article className="proto-checkout-card proto-review-card">
                  <div className="proto-checkout-card-head">
                    <h2>Review &amp; Place Order</h2>
                  </div>

                  <div className="proto-review-recap">
                    <div>
                      <span>Deliver to</span>
                      <strong>{addressStepSummary()}</strong>
                    </div>
                    <div>
                      <span>Shipping</span>
                      <strong>{SHIPPING_METHOD_OPTIONS.find((option) => option.value === shippingMethod)?.label || shippingMethod}</strong>
                    </div>
                    <div>
                      <span>Payment</span>
                      <strong>{PAYMENT_METHOD_OPTIONS.find((option) => option.value === paymentMethod)?.label || paymentMethod}</strong>
                    </div>
                  </div>

                  <div className="proto-review-items-heading">
                    <h3>Order Items</h3>
                    <span>Change quantity, remove, or add a product before you pay</span>
                  </div>
                  <CheckoutItemEditor
                    items={items}
                    existingProductIds={items.map((item) => item.productId)}
                    busy={reviewItemsBusy}
                    onQtyChange={handleReviewQtyChange}
                    onRemove={handleReviewRemoveItem}
                    onAddProduct={handleReviewAddProduct}
                  />

                  <button type="button" className="proto-review-total-row" onClick={() => setOrderDetailModalOpen(true)}>
                    <span>Grand Total · {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}</span>
                    <strong>{formatCurrency(totals.grandTotal)} <span className="proto-review-total-caret">View details ›</span></strong>
                  </button>
                  <div className="proto-inline-actions">
                    <StorefrontButton type="submit" disabled={submitting}>
                      {submitting ? "Submitting..." : paymentMethod === "online" ? "Pay Now" : "Place Order"}
                    </StorefrontButton>
                    {!isAuthenticated ? (
                      <StorefrontButton to="/account/login?redirect=%2Fcheckout" variant="light">
                        Login for Order Tracking
                      </StorefrontButton>
                    ) : null}
                  </div>
                </article>
              )}
            </form>
          )}
        </section>

        <aside className="proto-checkout-sidebar">
          <article className="proto-order-summary-card">
            <button type="button" className="proto-order-summary-heading-btn" onClick={() => setOrderDetailModalOpen(true)}>
              <h2>Order Summary</h2>
              <span>View details ›</span>
            </button>

            <div className="proto-checkout-items">
              {items.map((item) => (
                <div key={item.productId} className="proto-checkout-item">
                  <div className="proto-checkout-item-media">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} loading="lazy" />
                    ) : (
                      <span>{item.sku || "Jenix"}</span>
                    )}
                  </div>
                  <div className="proto-checkout-item-copy">
                    <p>{item.title}</p>
                    <span>
                      Qty {Number(item.qty || 0)} · {humanizeStatus(item.availabilityStatus)}
                    </span>
                    <strong>{formatCurrency(item.lineTotal)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="proto-summary-rows">
              <div><span>Product Total</span><strong>{formatCurrency(totals.taxableValue)}</strong></div>
              <div><span>Discount</span><strong>{formatCurrency(totals.discountAmount)}</strong></div>
              <div><span>Shipping</span><strong>{formatCurrency(totals.shippingCharge)}</strong></div>
              <div><span>GST</span><strong>{formatCurrency(totals.gstTotal)}</strong></div>
            </div>

            <button type="button" className="proto-summary-total proto-summary-total-btn" onClick={() => setOrderDetailModalOpen(true)}>
              <span>Grand Total</span>
              <strong>{formatCurrency(totals.grandTotal)}</strong>
              <small>inclusive of all taxes · tap to view breakdown</small>
            </button>

            <div className="proto-inline-actions">
              <StorefrontButton
                type="button"
                variant="light"
                onClick={handleRefreshTotals}
                disabled={previewLoading}
              >
                {previewLoading ? "Refreshing..." : "Refresh Totals"}
              </StorefrontButton>
            </div>
          </article>
        </aside>
      </div>

      {items.length > 0 ? (
        <StorefrontStickyActionBar className="proto-sticky-place-order">
          {activeStep === 1 ? (
            <button
              type="button"
              className="storefront-button proto-btn proto-btn-primary storefront-button-full proto-btn-full"
              onClick={() => goToStep(2)}
            >
              Continue to Shipping →
            </button>
          ) : activeStep === 2 ? (
            <button
              type="button"
              className="storefront-button proto-btn proto-btn-primary storefront-button-full proto-btn-full"
              onClick={() => goToStep(3)}
            >
              Continue to Payment →
            </button>
          ) : activeStep === 3 ? (
            <button
              type="button"
              className="storefront-button proto-btn proto-btn-primary storefront-button-full proto-btn-full"
              onClick={() => goToStep(4)}
            >
              Continue to Review →
            </button>
          ) : (
            <StorefrontButton type="submit" form="checkout-form" fullWidth disabled={submitting}>
              {submitting
                ? "Submitting..."
                : paymentMethod === "online"
                  ? `Pay Now · ${formatCurrency(totals.grandTotal)}`
                  : `Place Order · ${formatCurrency(totals.grandTotal)}`}
            </StorefrontButton>
          )}
        </StorefrontStickyActionBar>
      ) : null}

      <OrderDetailModal
        open={orderDetailModalOpen}
        onClose={() => setOrderDetailModalOpen(false)}
        items={items}
        pricing={cart?.pricing || {}}
      />
    </main>
  );
}
