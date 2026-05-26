import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { getOrCreateGuestSessionId } from "../../shared/cart/guest-session";
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
      <main className="front-shell">
        <div className="state-box">Loading recovery link...</div>
      </main>
    );
  }

  if (error && !preview) {
    return (
      <main className="front-shell">
        <div className="state-box error">{error}</div>
        <Link to="/" className="back-link">
          Back to storefront
        </Link>
      </main>
    );
  }

  const recovery = preview?.recovery || {};
  const support = preview?.support || {};
  const cartItems = Array.isArray(recovery.cartItems) ? recovery.cartItems : [];
  const feedbackOptions = Array.isArray(preview?.feedbackOptions) ? preview.feedbackOptions : [];

  return (
    <main className="front-shell account-shell">
      <header className="front-header account-hero">
        <div className="hero-kicker-row">
          <Link to="/" className="inline-link">Back to storefront</Link>
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
      </header>

      {error ? <div className="state-box error">{error}</div> : null}
      {notice ? <div className="state-box">{notice}</div> : null}

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head">
            <h3>Saved Items</h3>
            <p>Snapshot from the last tracked cart activity.</p>
          </div>
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
        </article>

        <article className="section-card">
          <div className="section-head">
            <h3>Restore Cart</h3>
            <p>
              Use the link directly, or sign in first if you want the restore to land in your
              account instead of this browser session.
            </p>
          </div>
          <div className="stack-form">
            <button
              type="button"
              className="btn primary"
              onClick={handleRestore}
              disabled={busy === "restore" || preview?.canRestore === false}
            >
              {busy === "restore"
                ? "Restoring..."
                : isAuthenticated
                  ? "Restore to My Account"
                  : "Restore to This Device"}
            </button>
            {!isAuthenticated ? (
              <Link
                to={`/account/login?redirect=${encodeURIComponent(`/recover/${recoveryToken}`)}`}
                className="btn secondary"
              >
                Login Before Restoring
              </Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head">
            <h3>What Stopped You?</h3>
            <p>Save one feedback reason so the team can understand checkout friction.</p>
          </div>
          <label className="field-grid">
            <span>Optional note</span>
            <input
              value={feedbackNote}
              onChange={(event) => setFeedbackNote(event.target.value)}
              placeholder="Any extra context"
            />
          </label>
          <div className="feedback-grid">
            {feedbackOptions.map((reason) => (
              <button
                key={reason}
                type="button"
                className="btn secondary feedback-btn"
                onClick={() => handleFeedback(reason)}
                disabled={busy === `feedback:${reason}`}
              >
                {busy === `feedback:${reason}` ? "Saving..." : reason}
              </button>
            ))}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head">
            <h3>Need Help?</h3>
            <p>Contact the support team directly from the recovery page.</p>
          </div>
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
              <a className="btn secondary" href={`mailto:${support.supportEmail}`}>
                Email
              </a>
            ) : null}
            {support.supportPhone ? (
              <a className="btn secondary" href={`tel:${support.supportPhone}`}>
                Call
              </a>
            ) : null}
            {support.supportWhatsApp ? (
              <a
                className="btn whatsapp"
                href={getSupportWhatsappLink(
                  support.supportWhatsApp,
                  "Need help completing my recovered cart."
                )}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}

