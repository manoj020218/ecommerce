import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { getOrCreateGuestSessionId } from "../../shared/cart/guest-session";
import { StorefrontLoadingState, StorefrontStickyActionBar } from "../../shared/storefront/storefront-ui";
import { formatCurrency } from "../account/account.utils";
import { getRecoveryPreview, restoreRecoveryCart, saveRecoveryFeedback } from "./recovery.api";
import {
  BRAND, cardStyle, ProgressSteps, SavedItem, TrustRow, HelpBox, FeedbackBox
} from "./recovery-parts";

// Customer-facing page behind the "you left something in your cart" link
// (/recover/:token). Redesigned 2026-09-27: shows the buyer their products
// (with photos), exactly where they stopped (cart / address / payment), and
// one clear button to carry on from that point. The previous page is kept
// in recovery-page.jsx (router can point back to it).

function whenText(iso) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  const time = new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `earlier today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  return `on ${new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

const RESUME_COPY = {
  cart: { cta: "Continue to checkout", line: "We've kept everything ready — pick up right where you left off." },
  checkout: { cta: "Resume checkout", line: "You had started checkout — we'll take you straight back to it." },
  payment: { cta: "Complete your order", line: "You were on the payment step. Your order is one step away." },
  payment_failed: { cta: "Try payment again", line: "Your payment didn't complete. You can try again or choose another payment method." }
};

function FriendlyError({ status }) {
  const expired = status === 410;
  return (
    <main className="proto-main-shell" style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px" }}>
        <div style={{ fontSize: 40 }}>{expired ? "⏳" : "🛒"}</div>
        <h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>
          {expired ? "This saved cart has expired" : "We couldn't find this saved cart"}
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 18px" }}>
          {expired
            ? "Saved carts are kept for a limited time. The products are still available in our store."
            : "The link may be incomplete. You can still find everything in our store."}
        </p>
        <Link to="/products" style={{
          display: "inline-block", background: BRAND, color: "#fff", padding: "12px 22px",
          borderRadius: 12, fontWeight: 700, textDecoration: "none"
        }}>
          Browse products
        </Link>
      </div>
    </main>
  );
}

export function RecoveryResumePage() {
  const { recoveryToken } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useCustomerSession();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState(0);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getRecoveryPreview(recoveryToken)
      .then((payload) => { if (mounted) setPreview(payload); })
      .catch((e) => { if (mounted) setLoadStatus(e?.status || 404); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [recoveryToken]);

  // Same restore flow as before: put the saved cart back, then land the buyer
  // on checkout (resuming their checkout session if they had one).
  async function handleContinue() {
    setRestoring(true);
    setError("");
    try {
      const payload = await restoreRecoveryCart(
        recoveryToken,
        isAuthenticated ? { mode: "replace" } : { targetSessionId: getOrCreateGuestSessionId(), mode: "replace" },
        isAuthenticated
      );
      const resumeUrl = payload.recovery?.checkoutSessionId
        ? `/checkout?session=${encodeURIComponent(payload.recovery.checkoutSessionId)}`
        : "/checkout";
      navigate(resumeUrl);
    } catch (e) {
      setError(e?.message || "We couldn't reload your cart. Please try again or contact us.");
      setRestoring(false);
    }
  }

  async function handleFeedback(reason, note) {
    try {
      await saveRecoveryFeedback(recoveryToken, { reason, note });
    } catch (e) {
      setError(e?.message || "Feedback could not be saved.");
      throw e;
    }
  }

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading your saved cart..." />
      </main>
    );
  }
  if (!preview) return <FriendlyError status={loadStatus} />;

  const recovery = preview.recovery || {};
  const support = preview.support || {};
  const details = preview.itemDetails || {};
  const cartItems = Array.isArray(recovery.cartItems) ? recovery.cartItems : [];
  const resumePoint = preview.resumePoint || "cart";
  const ordered = preview.canRestore === false || resumePoint === "ordered";
  const copy = RESUME_COPY[resumePoint] || RESUME_COPY.cart;
  const firstName = String(recovery.customerName || "").trim().split(/\s+/)[0];
  const itemsTotal = cartItems.reduce((s, i) => s + Number(i.lineTotal || 0), 0);
  const cartTotal = Number(recovery.cartValue || 0);
  const unitCount = cartItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  const anyUnavailable = cartItems.some((i) => details[i.productId]?.available === false);

  return (
    <main className="proto-main-shell" style={{ maxWidth: 760, margin: "0 auto", padding: "16px 16px 120px" }}>
      {/* ── welcome + where you left off ── */}
      <section style={{ ...cardStyle, padding: "22px 18px", background: "linear-gradient(135deg,#fff 0%,#fff7f6 100%)" }}>
        <span style={{
          display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
          color: BRAND, background: "rgba(232,35,26,0.08)", padding: "4px 10px", borderRadius: 20
        }}>
          🛒 YOUR SAVED CART
        </span>
        <h1 style={{ fontSize: 24, lineHeight: 1.25, margin: "12px 0 6px", color: "#111827" }}>
          {ordered ? "Your order is already placed 🎉" : `Welcome back${firstName ? `, ${firstName}` : ""}!`}
        </h1>
        <p style={{ fontSize: 14, color: "#4b5563", margin: 0 }}>
          {ordered
            ? "Thanks for shopping with Jenix India. You can track it from your account."
            : `You left ${unitCount} item${unitCount === 1 ? "" : "s"} in your cart ${whenText(recovery.lastActivityAt)}. ${copy.line}`}
        </p>
        <ProgressSteps resumePoint={ordered ? "ordered" : resumePoint} />
      </section>

      {error && (
        <div style={{ margin: "12px 0", padding: "10px 14px", borderRadius: 12, background: "#fee2e2", color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── the products ── */}
      <section style={{ ...cardStyle, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Items in your cart</h2>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{cartItems.length} product{cartItems.length === 1 ? "" : "s"}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          {cartItems.map((item) => (
            <SavedItem key={`${item.productId}-${item.sku}`} item={item}
              detail={details[item.productId] || (item.slug ? { slug: item.slug } : undefined)} />
          ))}
        </div>
        {anyUnavailable && (
          <p style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", borderRadius: 10, padding: "8px 12px", margin: "8px 0 0" }}>
            Some items are currently unavailable — you can still continue with the rest, or contact us for an alternative.
          </p>
        )}
        <div style={{ borderTop: "1px solid #eef0f3", marginTop: 10, paddingTop: 12, display: "grid", gap: 6, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>Items total</span>
            <strong>{formatCurrency(itemsTotal)}</strong>
          </div>
          {cartTotal > itemsTotal + 0.5 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4b5563" }}>Cart total with GST & delivery</span>
              <strong>{formatCurrency(cartTotal)}</strong>
            </div>
          )}
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Final price, delivery and GST are confirmed at checkout before you pay.
          </span>
        </div>
      </section>

      {/* ── main action ── */}
      {/* The main "continue" button lives in the sticky bar at the bottom
          (always visible); a second identical button here was redundant. */}
      {!ordered && (
        <section style={{ marginTop: 10 }}>
          {!isAuthenticated && (
            <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", margin: "8px 0 0" }}>
              Have an account?{" "}
              <Link to={`/account/login?redirect=${encodeURIComponent(`/recover/${recoveryToken}`)}`} style={{ color: BRAND, fontWeight: 600 }}>
                Sign in
              </Link>{" "}
              to keep this cart in your account.
            </p>
          )}
        </section>
      )}
      {ordered && (
        <section style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/account" style={{ flex: 1, textAlign: "center", background: BRAND, color: "#fff", padding: "13px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>
            View my orders
          </Link>
          <Link to="/products" style={{ flex: 1, textAlign: "center", background: "#f3f4f6", color: "#111827", padding: "13px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>
            Continue shopping
          </Link>
        </section>
      )}

      <section style={{ marginTop: 14 }}><TrustRow /></section>
      <section style={{ marginTop: 14 }}><HelpBox support={support} cartItems={cartItems} /></section>
      {!ordered && Array.isArray(preview.feedbackOptions) && preview.feedbackOptions.length > 0 && (
        <section style={{ marginTop: 14 }}>
          <FeedbackBox options={preview.feedbackOptions} onSubmit={handleFeedback} />
        </section>
      )}

      {!ordered && (
        <StorefrontStickyActionBar className="proto-sticky-recovery-bar">
          <div>
            <span>{unitCount} item{unitCount === 1 ? "" : "s"}</span>
            <strong>{formatCurrency(cartTotal > itemsTotal ? cartTotal : itemsTotal)}</strong>
          </div>
          <button type="button" onClick={handleContinue} disabled={restoring} style={{
            border: "none", borderRadius: 12, padding: "12px 18px", background: BRAND, color: "#fff",
            fontSize: 14, fontWeight: 800, cursor: restoring ? "wait" : "pointer", flex: 1, marginLeft: 12
          }}>
            {restoring ? "Loading…" : copy.cta}
          </button>
        </StorefrontStickyActionBar>
      )}
    </main>
  );
}
