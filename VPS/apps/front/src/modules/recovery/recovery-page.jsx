import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { getOrCreateGuestSessionId } from "../../shared/cart/guest-session";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontCard,
  StorefrontErrorState,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontSectionHeader,
  StorefrontStickyActionBar
} from "../../shared/storefront/storefront-ui";
import { formatCurrency, humanizeStatus, getSupportWhatsappLink } from "../account/account.utils";
import {
  getRecoveryPreview,
  restoreRecoveryCart,
  saveRecoveryFeedback
} from "./recovery.api";

export function RecoveryPage() {
  const { recoveryToken } = useParams();
  const { customer, isAuthenticated } = useCustomerSession();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    getRecoveryPreview(recoveryToken)
      .then((payload) => {
        if (mounted) {
          setPreview(payload);
        }
      })
      .catch((requestError) => {
        if (mounted) {
          setError(requestError.message || "Recovery link could not be loaded.");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [recoveryToken]);

  async function handleRestore() {
    setBusy("restore");
    setError("");
    setNotice("");

    try {
      const payload = await restoreRecoveryCart(
        recoveryToken,
        isAuthenticated
          ? { mode: "replace" }
          : {
              targetSessionId: getOrCreateGuestSessionId(),
              mode: "replace"
            },
        isAuthenticated
      );
      setNotice(
        isAuthenticated
          ? "Cart restored into your customer account."
          : "Cart restored into this browser session."
      );
      setPreview((current) =>
        current
          ? {
              ...current,
              recovery: payload.recovery,
              canRestore: false
            }
          : current
      );
    } catch (requestError) {
      setError(requestError.message || "Cart restore failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleFeedback(reason) {
    setBusy(`feedback:${reason}`);
    setError("");
    setNotice("");

    try {
      const payload = await saveRecoveryFeedback(recoveryToken, {
        reason,
        note: feedbackNote
      });
      setPreview((current) =>
        current
          ? {
              ...current,
              recovery: payload
            }
          : current
      );
      setNotice("Feedback saved. The support team can review this friction reason.");
    } catch (requestError) {
      setError(requestError.message || "Feedback could not be saved.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading recovery link..." />
      </main>
    );
  }

  if (error && !preview) {
    return (
      <main className="proto-main-shell">
        <StorefrontErrorState
          message={error}
          action={
            <StorefrontButton to="/" variant="light">
              Back to storefront
            </StorefrontButton>
          }
        />
      </main>
    );
  }

  const recovery = preview?.recovery || {};
  const support = preview?.support || {};
  const cartItems = Array.isArray(recovery.cartItems) ? recovery.cartItems : [];
  const feedbackOptions = Array.isArray(preview?.feedbackOptions) ? preview.feedbackOptions : [];

  return (
    <main className="proto-main-shell account-shell recovery-shell">
      <StorefrontCard className="front-header account-hero" elevated>
        <div className="hero-kicker-row">
          <StorefrontButton to="/" variant="light">Back to storefront</StorefrontButton>
          <span className="eyebrow-chip">Cart recovery</span>
        </div>
        <div className="account-hero-copy">
          <div>
            <p className="eyebrow-text">Recovery Link</p>
            <h1>{recovery.customerName || "Continue your saved cart"}</h1>
            <p className="hero-muted">
              Stage: {humanizeStatus(recovery.stage)}. Restore the cart into{" "}
              {isAuthenticated
                ? `${customer?.name || "your account"}`
                : "this browser session"} and continue from there.
            </p>
          </div>
          <div className="hero-stat-grid">
            <div className="metric-card">
              <strong>{recovery.cartItemCount || 0}</strong>
              <span>Items saved</span>
            </div>
            <div className="metric-card">
              <strong>{formatCurrency(recovery.cartValue)}</strong>
              <span>Saved cart value</span>
            </div>
          </div>
        </div>
      </StorefrontCard>

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Saved Items"
            description="Snapshot from the last tracked cart activity."
          />
          <div className="card-list">
            {cartItems.length ? (
              cartItems.map((item) => (
                <div key={`${item.productId}-${item.sku}`} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <strong>{item.title}</strong>
                      <p>SKU: {item.sku || "--"}</p>
                    </div>
                    <span className="eyebrow-chip">{humanizeStatus(item.availabilityStatus)}</span>
                  </div>
                  <div className="detail-pairs compact">
                    <div>
                      <span>Qty</span>
                      <strong>{item.qty}</strong>
                    </div>
                    <div>
                      <span>Unit Price</span>
                      <strong>{formatCurrency(item.unitPrice)}</strong>
                    </div>
                    <div>
                      <span>Line Total</span>
                      <strong>{formatCurrency(item.lineTotal)}</strong>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-panel">No saved items are available on this link.</div>
            )}
          </div>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Restore Cart"
            description="Use the link directly, or sign in first if you want the restore to land in your account instead of this browser session."
          />
          <div className="stack-form">
            <StorefrontButton
              type="button"
              onClick={handleRestore}
              disabled={busy === "restore" || preview?.canRestore === false}
            >
              {busy === "restore"
                ? "Restoring..."
                : isAuthenticated
                  ? "Restore to My Account"
                  : "Restore to This Device"}
            </StorefrontButton>
            {!isAuthenticated ? (
              <StorefrontButton
                to={`/account/login?redirect=${encodeURIComponent(`/recover/${recoveryToken}`)}`}
                variant="light"
              >
                Login Before Restoring
              </StorefrontButton>
            ) : null}
          </div>
        </StorefrontCard>
      </section>

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="What Stopped You?"
            description="Save one feedback reason so the team can understand checkout friction."
          />
          <div className="field-grid">
            <StorefrontInput
              label="Optional note"
              value={feedbackNote}
              onChange={(event) => setFeedbackNote(event.target.value)}
              placeholder="Any extra context"
            />
          </div>
          <div className="feedback-grid">
            {feedbackOptions.map((reason) => (
              <StorefrontButton
                key={reason}
                type="button"
                variant="light"
                className="feedback-btn"
                onClick={() => handleFeedback(reason)}
                disabled={busy === `feedback:${reason}`}
              >
                {busy === `feedback:${reason}` ? "Saving..." : reason}
              </StorefrontButton>
            ))}
          </div>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Need Help?"
            description="Contact the support team directly from the recovery page."
          />
          <div className="detail-pairs">
            <div>
              <span>Store</span>
              <strong>{support.storeName || "Jenix India"}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{support.supportEmail || "--"}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{support.supportPhone || "--"}</strong>
            </div>
          </div>
          <div className="action-row">
            {support.supportEmail ? (
              <StorefrontButton href={`mailto:${support.supportEmail}`} variant="light">
                Email
              </StorefrontButton>
            ) : null}
            {support.supportPhone ? (
              <StorefrontButton href={`tel:${support.supportPhone}`} variant="light">
                Call
              </StorefrontButton>
            ) : null}
            {support.supportWhatsApp ? (
              <StorefrontButton
                href={getSupportWhatsappLink(
                  support.supportWhatsApp,
                  "Need help completing my recovered cart."
                )}
                target="_blank"
                rel="noreferrer"
                variant="whatsapp"
              >
                WhatsApp
              </StorefrontButton>
            ) : null}
          </div>
        </StorefrontCard>
      </section>

      <StorefrontStickyActionBar className="proto-sticky-recovery-bar">
        <div>
          <span>Saved Cart</span>
          <strong>{formatCurrency(recovery.cartValue)}</strong>
        </div>
        {preview?.canRestore === false ? (
          <StorefrontButton to="/products" variant="light">
            Browse Products
          </StorefrontButton>
        ) : (
          <StorefrontButton
            type="button"
            onClick={handleRestore}
            disabled={busy === "restore"}
          >
            {busy === "restore"
              ? "Restoring..."
              : isAuthenticated
                ? "Restore to My Account"
                : "Restore to This Device"}
          </StorefrontButton>
        )}
      </StorefrontStickyActionBar>
    </main>
  );
}
