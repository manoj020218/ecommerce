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
                        onClick={() => removeItem(item.productId)}
                        disabled={busyKey === `remove:${item.productId}`}
                      >
                        {busyKey === `remove:${item.productId}` ? "Removing..." : "Remove"}
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
                    <strong>{formatCurrency(totals.productSubtotal)}</strong>
                  </div>
                  <div>
                    <span>Discount</span>
                    <strong>{formatCurrency(totals.discountAmount)}</strong>
                  </div>
                  <div>
                    <span>GST</span>
                    <strong>{formatCurrency(totals.gstTotal)}</strong>
                  </div>
                  <div>
                    <span>Shipping</span>
                    <strong>{formatCurrency(totals.shippingCharge)}</strong>
                  </div>
                </div>

                <div className="proto-summary-total">
                  <span>Grand Total</span>
                  <strong>{formatCurrency(totals.grandTotal)}</strong>
                  <small>inclusive of all taxes</small>
                </div>

                <div className="proto-summary-hint">
                  Pay via <strong>Bank Transfer / UPI</strong> and save an estimated{" "}
                  <strong>{formatCurrency(estimatedDirectPaySavings)}</strong> at checkout.
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
