import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { resetGuestSessionId } from "../../shared/cart/guest-session";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontEmptyState,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontStickyActionBar
} from "../../shared/storefront/storefront-ui";
import {
  buildCartContext,
  formatCurrency,
  getExistingGuestSessionId,
  humanizeStatus,
  notifyStorefrontCartUpdated
} from "./cart.utils";
import { watchdog } from "../../shared/watchdog-client";
import {
  deleteCartItem,
  getCart,
  mergeGuestCart,
  updateCartItem
} from "../products/products.api";

export function CartPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: sessionLoading } = useCustomerSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [cart, setCart] = useState(null);
  const [promoCode, setPromoCode] = useState("");

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

  const estimatedDirectPaySavings = Math.round(totals.productSubtotal * 0.02 * 100) / 100;

  const loadCart = async () => {
    const data = await getCart(buildCartContext(isAuthenticated));
    setCart(data);
    if (data?.id || data?.itemCount > 0) {
      watchdog.trackCartView(data?.id, data?.pricing?.grandTotal);
    }
  };

  useEffect(() => {
    if (sessionLoading) {
      return undefined;
    }

    let active = true;

    const bootstrap = async () => {
      setLoading(true);
      setError("");

      try {
        if (isAuthenticated) {
          const guestSessionId = getExistingGuestSessionId();
          if (guestSessionId) {
            const merged = await mergeGuestCart(guestSessionId);
            if (!active) {
              return;
            }

            if (merged?.merged) {
              resetGuestSessionId();
              setNotice("Guest cart merged into your customer cart.");
              setCart(merged.cart || null);
              notifyStorefrontCartUpdated();
              return;
            }
          }
        }

        await loadCart();
      } catch (requestError) {
        if (active) {
          setError(requestError.message || "Failed to load cart.");
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
  }, [isAuthenticated, sessionLoading]);

  const changeQuantity = async (productId, nextQty) => {
    setBusyKey(`qty:${productId}`);
    setError("");
    setNotice("");

    try {
      if (nextQty <= 0) {
        await deleteCartItem(productId, buildCartContext(isAuthenticated));
      } else {
        await updateCartItem(productId, {
          ...buildCartContext(isAuthenticated),
          qty: nextQty
        });
      }

      await loadCart();
      notifyStorefrontCartUpdated();
    } catch (requestError) {
      setError(requestError.message || "Failed to update cart quantity.");
    } finally {
      setBusyKey("");
    }
  };

  const removeItem = async (productId) => {
    setBusyKey(`remove:${productId}`);
    setError("");
    setNotice("");

    try {
      await deleteCartItem(productId, buildCartContext(isAuthenticated));
      await loadCart();
      notifyStorefrontCartUpdated();
    } catch (requestError) {
      setError(requestError.message || "Failed to remove cart item.");
    } finally {
      setBusyKey("");
    }
  };

  if (sessionLoading || loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading cart..." />
      </main>
    );
  }

  const items = Array.isArray(cart?.items) ? cart.items : [];

  return (
    <main className="proto-main-shell proto-cart-page">
      <div className="proto-cart-shell">
        <StorefrontPageHeader
          title="Your Cart"
          description={`${totals.itemCount} item${totals.itemCount === 1 ? "" : "s"} in your cart`}
        />

        {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
        {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

        {items.length === 0 ? (
          <section className="proto-cart-empty">
            <StorefrontEmptyState
              title="Your cart is empty"
              description="Add products from the storefront to begin checkout."
              action={<StorefrontButton to="/products" variant="light">Browse Products</StorefrontButton>}
            />
          </section>
        ) : (
          <section className="proto-cart-layout">
            <div className="proto-cart-lines">
              {items.map((item) => (
                <article key={item.productId} className="proto-cart-line-card">
                  <div className="proto-cart-line-media">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} loading="lazy" />
                    ) : (
                      <span>{item.sku || "Jenix"}</span>
                    )}
                  </div>

                  <div className="proto-cart-line-body">
                    <div className="proto-cart-line-head">
                      <div>
                        <p>{item.brand || "Jenix India"}</p>
                        <Link to={item.slug ? `/products/${item.slug}` : "/products"}>
                          {item.title}
                        </Link>
                        <small>SKU: {item.sku || item.productId}</small>
                      </div>
                      <button
                        type="button"
                        className="proto-line-remove"
                        aria-label="Remove item"
                        onClick={() => removeItem(item.productId)}
                        disabled={busyKey === `remove:${item.productId}`}
                      >
                        {busyKey === `remove:${item.productId}` ? (
                          <span style={{ fontSize: 11 }}>…</span>
                        ) : (
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </div>

                    <div className="proto-cart-line-meta">
                      <span>{humanizeStatus(item.availabilityStatus)}</span>
                      <span>MOQ {Number(item.moq || 1)}</span>
                      <span>GST {Number(item.gstRate || 0)}%</span>
                    </div>

                    <div className="proto-cart-line-footer">
                      <div className="proto-qty-control">
                        <button
                          type="button"
                          onClick={() => changeQuantity(item.productId, Number(item.qty || 0) - 1)}
                          disabled={busyKey === `qty:${item.productId}`}
                        >
                          -
                        </button>
                        <strong>{Number(item.qty || 0)}</strong>
                        <button
                          type="button"
                          onClick={() => changeQuantity(item.productId, Number(item.qty || 0) + 1)}
                          disabled={busyKey === `qty:${item.productId}`}
                        >
                          +
                        </button>
                      </div>

                      <div className="proto-cart-line-price">
                        <strong>{formatCurrency(item.lineTotal)}</strong>
                        <small>{formatCurrency(item.unitPriceUsed)} each</small>
                        {Number(item.gstRate || 0) > 0 ? (
                          <small className="proto-cart-gst-line" style={item.priceIncludesGst ? { color: "#15803d" } : {}}>
                            {item.priceIncludesGst ? `GST ${Number(item.gstRate)}% incl.` : `+GST ${Number(item.gstRate)}%`}
                          </small>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              <section className="proto-promo-card">
                <h2>Apply Promo Code</h2>
                <form
                  className="proto-promo-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setNotice(
                      promoCode.trim()
                        ? "Promo code capture is ready. Pricing rules can be connected when promo configuration is enabled."
                        : "Enter a promo code to continue."
                    );
                  }}
                >
                  <StorefrontInput
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                    placeholder="Enter promo code"
                  />
                  <StorefrontButton type="submit" variant="dark">
                    Apply
                  </StorefrontButton>
                </form>
              </section>
            </div>

            <aside className="proto-order-summary">
              <div className="proto-order-summary-card">
                <h2>Order Summary</h2>

                <div className="proto-summary-rows">
                  <div>
                    <span>Product Total ({totals.itemCount} items)</span>
                    <strong>{formatCurrency(totals.taxableValue)}</strong>
                  </div>
                  <div>
                    <span>Discount</span>
                    <strong>{formatCurrency(totals.discountAmount)}</strong>
                  </div>
                  <div>
                    <span>Shipping</span>
                    <strong>{formatCurrency(totals.shippingCharge)}</strong>
                  </div>
                  <div>
                    <span>GST</span>
                    <strong>{formatCurrency(totals.gstTotal)}</strong>
                  </div>
                </div>

                <div className="proto-summary-total">
                  <span>Grand Total</span>
                  <strong>{formatCurrency(totals.grandTotal)}</strong>
                  <small>inclusive of all taxes</small>
                </div>

                <div className="proto-summary-hint">
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ flexShrink: 0, color: "#16a34a", marginTop: 2 }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" fill="none" strokeWidth="2" />
                    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>Pay via <strong>Bank Transfer / UPI</strong> and save an estimated{" "}
                  <strong>{formatCurrency(estimatedDirectPaySavings)}</strong> at checkout.</span>
                </div>

                <StorefrontButton
                  type="button"
                  fullWidth
                  onClick={() => navigate("/checkout")}
                >
                  Proceed to Checkout
                </StorefrontButton>
                <Link to="/products" className="proto-summary-link">
                  Continue Shopping
                </Link>

                <div className="proto-trust-strip">
                  <div>
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#16a34a" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Secure Pay</span>
                  </div>
                  <div>
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#2563eb" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#2563eb" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>GST Invoice</span>
                  </div>
                  <div>
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="var(--brand)" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="3" y1="6" x2="21" y2="6" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
                      <path d="M16 10a4 4 0 01-8 0" stroke="var(--brand)" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Easy Return</span>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        )}
      </div>

      {items.length > 0 ? (
        <StorefrontStickyActionBar className="proto-sticky-checkout-bar">
          <div>
            <span>Grand Total</span>
            <strong>{formatCurrency(totals.grandTotal)}</strong>
          </div>
          <StorefrontButton type="button" onClick={() => navigate("/checkout")}>
            Proceed to Checkout
          </StorefrontButton>
        </StorefrontStickyActionBar>
      ) : null}
    </main>
  );
}
