import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getCustomerAccountBootstrap,
  listSavedProducts,
  removeSavedProduct,
  saveProduct
} from "../account/account.api";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontBadge,
  StorefrontButton,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontSectionHeader,
  StorefrontSelect,
  StorefrontStickyActionBar
} from "../../shared/storefront/storefront-ui";
import {
  addCartItem,
  deleteCartItem,
  estimateShipping,
  getCustomerCart,
  getProduct,
  getProductPageBundle,
  getProductRecommendations,
  requestNotifyWhenAvailable,
  startCheckout,
  updateCartItem
} from "./products.api";
import {
  buildCartContext,
  notifyStorefrontCartUpdated
} from "../cart/cart.utils";

function currency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function resolveImg(img) {
  if (!img) return "";
  if (typeof img === "string") return img;
  return img.url || img.thumbnail || "";
}

function statusLabel(stockStatus) {
  if (stockStatus === "in_stock") {
    return "In Stock";
  }
  if (stockStatus === "low_stock") {
    return "Limited Stock";
  }
  if (stockStatus === "backorder") {
    return "Backorder Available";
  }
  return "Out of Stock";
}

function statusTone(stockStatus) {
  if (stockStatus === "in_stock") {
    return "success";
  }
  if (stockStatus === "low_stock") {
    return "warning";
  }
  if (stockStatus === "backorder") {
    return "info";
  }
  return "danger";
}

function visiblePrice(product) {
  return Number(product?.pricing?.visiblePrice ?? product?.salePrice ?? 0);
}

function compareAtPrice(product) {
  if (product?.pricing?.compareAtPrice !== null && product?.pricing?.compareAtPrice !== undefined) {
    return Number(product.pricing.compareAtPrice);
  }

  const basePrice = Number(product?.basePrice || 0);
  const salePrice = Number(product?.salePrice || 0);
  return basePrice > salePrice ? basePrice : null;
}

function defaultAddress(savedAddresses = []) {
  if (!Array.isArray(savedAddresses) || savedAddresses.length === 0) {
    return null;
  }

  return (
    savedAddresses.find((address) => address.isDefaultShipping) ||
    savedAddresses.find((address) => address.isDefaultBilling) ||
    savedAddresses[0]
  );
}

function ProductMiniCard({ product }) {
  return (
    <Link to={`/products/${product.slug}`} className="proto-mini-product">
      <div className="proto-mini-product-media">
        {Array.isArray(product.images) && product.images[0] ? (
          <img src={resolveImg(product.images[0])} alt={product.title} loading="lazy" />
        ) : (
          <span>{product.brand || "Jenix"}</span>
        )}
      </div>
      <div className="proto-mini-product-copy">
        <p>{product.title}</p>
        <strong>{currency(visiblePrice(product))}</strong>
      </div>
    </Link>
  );
}

function ProductCarousel({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <section className="proto-section">
      <StorefrontSectionHeader title={title} />
      <div className="proto-mini-product-track">
        {items.map((product) => (
          <ProductMiniCard key={`${title}-${product.id}`} product={product} />
        ))}
      </div>
    </section>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { customer, isAuthenticated } = useCustomerSession();
  const [product, setProduct] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [pageSeo, setPageSeo] = useState(null);
  const [structuredData, setStructuredData] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState("keyFeatures");
  const [selectedImage, setSelectedImage] = useState("");
  const [pincode, setPincode] = useState("");
  const [shipping, setShipping] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notifyForm, setNotifyForm] = useState({
    customerName: "",
    email: "",
    mobile: ""
  });
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [notifyNotice, setNotifyNotice] = useState("");
  const [orderRequestForm, setOrderRequestForm] = useState({
    companyName: "",
    gstin: "",
    name: "",
    mobile: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    stateCode: "",
    pincode: "",
    country: "India",
    shippingMethod: "standard"
  });
  const [orderRequestLoading, setOrderRequestLoading] = useState(false);
  const [orderRequestError, setOrderRequestError] = useState("");
  const [orderRequestNotice, setOrderRequestNotice] = useState("");
  const [cartActionBusy, setCartActionBusy] = useState("");
  const [cartActionError, setCartActionError] = useState("");
  const [cartActionNotice, setCartActionNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    setRecommendationError("");
    setShipping(null);
    setShippingError("");
    setPageSeo(null);
    setStructuredData(null);
    setNotifyError("");
    setNotifyNotice("");
    setCartActionError("");
    setCartActionNotice("");
    setSelectedImage("");

    getProduct(slug)
      .then((data) => {
        if (!mounted) {
          return;
        }
        setProduct(data);
        setSelectedImage(Array.isArray(data.images) && data.images[0] ? resolveImg(data.images[0]) : "");
        setQuantity(Math.max(1, Number(data.moq || 1)));
        setBreadcrumb([
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
          { label: data.title, href: `/products/${data.slug}` }
        ]);
      })
      .catch((requestError) => {
        if (mounted) {
          setError(requestError.message || "Failed to load product.");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    getProductPageBundle(slug)
      .then((bundle) => {
        if (!mounted) {
          return;
        }
        if (Array.isArray(bundle.breadcrumb) && bundle.breadcrumb.length > 0) {
          setBreadcrumb(bundle.breadcrumb);
        }
        setPageSeo(bundle?.seo || null);
        setStructuredData(bundle?.structuredData || null);
        if (bundle?.recommendations) {
          setRecommendations(bundle.recommendations);
        }
      })
      .catch(async (requestError) => {
        if (!mounted) {
          return;
        }

        try {
          const fallback = await getProductRecommendations(slug);
          if (mounted) {
            setRecommendations(fallback);
            setRecommendationError(
              "Primary recommendation bundle failed, fallback recommendations loaded."
            );
          }
        } catch (_fallbackError) {
          if (mounted) {
            setRecommendationError(
              requestError.message || "Recommendations are temporarily unavailable."
            );
          }
        }
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    const nextTitle = pageSeo?.metaTitle || product?.title;
    if (!nextTitle) return;

    document.title = nextTitle;

    const upsertMeta = (name, content, attr = "name") => {
      if (!content) return;
      let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
      if (!tag) { tag = document.createElement("meta"); tag.setAttribute(attr, name); document.head.append(tag); }
      tag.setAttribute("content", content);
    };

    const upsertCanonical = (href) => {
      if (!href) return;
      let link = document.head.querySelector('link[rel="canonical"]');
      if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.append(link); }
      link.setAttribute("href", href);
    };

    upsertMeta("description", pageSeo?.metaDescription);
    upsertMeta("robots", "index, follow");
    upsertCanonical(pageSeo?.canonicalUrl);
    upsertMeta("og:title", nextTitle, "property");
    upsertMeta("og:description", pageSeo?.metaDescription, "property");
    upsertMeta("og:url", pageSeo?.canonicalUrl, "property");
    upsertMeta("og:type", "product", "property");
    if (pageSeo?.ogImageUrl) upsertMeta("og:image", pageSeo.ogImageUrl, "property");
  }, [pageSeo, product?.title]);

  useEffect(() => {
    if (!product?.id || !isAuthenticated) {
      setSaved(false);
      setSaveError("");
      return;
    }

    let mounted = true;

    listSavedProducts()
      .then((items) => {
        if (mounted) {
          setSaved(Array.isArray(items) && items.some((item) => item.id === product.id));
        }
      })
      .catch((requestError) => {
        if (mounted) {
          setSaveError(requestError.message || "Saved products could not be loaded.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, product?.id]);

  useEffect(() => {
    setNotifyForm((current) => ({
      customerName: current.customerName || customer?.name || "",
      email: current.email || customer?.email || "",
      mobile: current.mobile || customer?.mobile || ""
    }));
  }, [customer?.email, customer?.mobile, customer?.name]);

  useEffect(() => {
    if (!isAuthenticated || !product?.pricing?.usesOrderRequestFlow) {
      return undefined;
    }

    let mounted = true;

    getCustomerAccountBootstrap(3)
      .then((snapshot) => {
        if (!mounted) {
          return;
        }

        const address = defaultAddress(snapshot?.savedAddresses || []);
        setOrderRequestForm((current) => ({
          ...current,
          companyName:
            current.companyName ||
            snapshot?.profile?.companyName ||
            snapshot?.gstDetails?.businessName ||
            "",
          gstin: current.gstin || snapshot?.profile?.gstin || snapshot?.gstDetails?.gstin || "",
          name: current.name || address?.name || snapshot?.profile?.name || customer?.name || "",
          mobile: current.mobile || address?.mobile || snapshot?.profile?.mobile || customer?.mobile || "",
          email: current.email || address?.email || snapshot?.profile?.email || customer?.email || "",
          addressLine1: current.addressLine1 || address?.addressLine1 || "",
          addressLine2: current.addressLine2 || address?.addressLine2 || "",
          city: current.city || address?.city || "",
          state: current.state || address?.state || "",
          stateCode: current.stateCode || address?.stateCode || "",
          pincode: current.pincode || address?.pincode || "",
          country: current.country || address?.country || "India"
        }));
      })
      .catch(() => {
        // Keep the form editable if account bootstrap fails.
      });

    return () => {
      mounted = false;
    };
  }, [
    customer?.email,
    customer?.mobile,
    customer?.name,
    isAuthenticated,
    product?.pricing?.usesOrderRequestFlow
  ]);

  const effectiveBulkSlabs = useMemo(() => {
    if (!product || product?.pricing?.isB2BPrice) {
      return [];
    }

    const slabs = Array.isArray(product.bulkPriceSlabs) ? [...product.bulkPriceSlabs] : [];
    return slabs.sort((left, right) => Number(left.minQty) - Number(right.minQty));
  }, [product]);

  const images = Array.isArray(product?.images) ? product.images.map(resolveImg) : [];
  const keyFeatures = Array.isArray(product?.keyFeatures) ? product.keyFeatures : [];
  const specs =
    product?.specifications && typeof product.specifications === "object"
      ? Object.entries(product.specifications)
      : [];
  const downloads = Array.isArray(product?.downloads) ? product.downloads : [];
  const recGroups = recommendations?.recommendationGroups || {};
  const guides = Array.isArray(recommendations?.guides) ? recommendations.guides : [];
  const showNotifyWhenAvailable = product?.stockStatus === "out_of_stock";
  const dealerOrderRequestFlow = Boolean(
    isAuthenticated && product?.pricing?.usesOrderRequestFlow
  );
  const nextVisiblePrice = visiblePrice(product);
  const nextCompareAtPrice = compareAtPrice(product);
  const saveAmount =
    nextCompareAtPrice && nextCompareAtPrice > nextVisiblePrice
      ? nextCompareAtPrice - nextVisiblePrice
      : 0;
  const featureChips = keyFeatures.slice(0, 5);
  const activeImage = selectedImage || images[0] || "";
  const discountPct =
    nextCompareAtPrice && nextCompareAtPrice > nextVisiblePrice
      ? Math.round((1 - nextVisiblePrice / nextCompareAtPrice) * 100)
      : 0;

  const submitNotifyRequest = async (event) => {
    event.preventDefault();
    setNotifyLoading(true);
    setNotifyError("");
    setNotifyNotice("");

    try {
      await requestNotifyWhenAvailable({
        productId: product.id,
        customerName: notifyForm.customerName,
        email: notifyForm.email,
        mobile: notifyForm.mobile,
        sourcePage: location.pathname
      });
      setNotifyNotice("Availability request saved. We will contact you when this product is back.");
    } catch (requestError) {
      setNotifyError(requestError.message || "Failed to save your availability request.");
    } finally {
      setNotifyLoading(false);
    }
  };

  const submitDealerOrderRequest = async (event) => {
    event.preventDefault();
    setOrderRequestLoading(true);
    setOrderRequestError("");
    setOrderRequestNotice("");

    try {
      const cart = await getCustomerCart();
      const currentItems = Array.isArray(cart?.items) ? cart.items : [];
      const targetItem = currentItems.find((item) => item.productId === product.id);

      await Promise.all(
        currentItems
          .filter((item) => item.productId !== product.id)
          .map((item) => deleteCartItem(item.productId))
      );

      if (targetItem) {
        await updateCartItem(product.id, { qty: quantity });
      } else {
        await addCartItem({
          productId: product.id,
          qty: quantity
        });
      }

      notifyStorefrontCartUpdated();

      const address = {
        companyName: orderRequestForm.companyName,
        gstin: orderRequestForm.gstin,
        name: orderRequestForm.name,
        mobile: orderRequestForm.mobile,
        email: orderRequestForm.email,
        addressLine1: orderRequestForm.addressLine1,
        addressLine2: orderRequestForm.addressLine2,
        city: orderRequestForm.city,
        state: orderRequestForm.state,
        stateCode: orderRequestForm.stateCode,
        pincode: orderRequestForm.pincode,
        country: orderRequestForm.country
      };

      const checkout = await startCheckout({
        paymentMethod: "direct_bank_transfer",
        shippingMethod: orderRequestForm.shippingMethod,
        billingAddress: address,
        shippingAddress: address
      });

      setOrderRequestNotice(
        `Order request created. Reference ${checkout?.order?.orderNo || checkout?.checkoutSession?.orderId || "saved"}.`
      );
    } catch (requestError) {
      setOrderRequestError(requestError.message || "Failed to create dealer order request.");
    } finally {
      setOrderRequestLoading(false);
    }
  };

  const handleCartAction = async (mode) => {
    if (!product || showNotifyWhenAvailable) {
      return;
    }

    setCartActionBusy(mode);
    setCartActionError("");
    setCartActionNotice("");

    try {
      await addCartItem({
        ...buildCartContext(isAuthenticated),
        productId: product.id,
        qty: quantity
      });
      notifyStorefrontCartUpdated();

      if (mode === "buy") {
        navigate("/checkout");
      } else {
        setCartActionNotice("Added to cart. Review it before checkout.");
      }
    } catch (requestError) {
      setCartActionError(requestError.message || "Unable to update cart.");
    } finally {
      setCartActionBusy("");
    }
  };

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading product..." />
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="proto-main-shell">
        <StorefrontAlert tone="error">{error || "Product not found."}</StorefrontAlert>
        <StorefrontButton to="/products" variant="light">
          Back to products
        </StorefrontButton>
      </main>
    );
  }

  return (
    <main className="proto-main-shell proto-product-page">
      {structuredData?.product ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData.product) }}
        />
      ) : null}
      {structuredData?.offer ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData.offer) }}
        />
      ) : null}
      {structuredData?.breadcrumb ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData.breadcrumb) }}
        />
      ) : null}

      <nav className="proto-breadcrumb">
        {breadcrumb.map((item, index) => (
          <span key={`${item.label}-${index}`}>
            {index > 0 ? <em>/</em> : null}
            {index === breadcrumb.length - 1 ? (
              <strong>{item.label}</strong>
            ) : (
              <Link to={item.href || "/"}>{item.label}</Link>
            )}
          </span>
        ))}
      </nav>

      <section className="proto-product-layout">
        <div className="proto-product-gallery">
          <div className="proto-product-main-image">
            {activeImage ? (
              <img src={activeImage} alt={product.title} />
            ) : (
              <div className="proto-product-placeholder large">Product image</div>
            )}
            {discountPct > 0 ? (
              <span className="proto-product-flag">-{discountPct}% OFF</span>
            ) : null}
            <span className="proto-product-sku-badge">{product.sku || product.modelNumber || "SKU"}</span>
          </div>

          {images.length > 0 ? (
            <div className="proto-product-thumbs">
              {images.slice(0, 6).map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  className={`proto-product-thumb${activeImage === imageUrl ? " active" : ""}`}
                  onClick={() => setSelectedImage(imageUrl)}
                >
                  <img src={imageUrl} alt={`${product.title} ${index + 1}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="proto-product-summary">
          <div className="proto-product-meta-top">
            <StorefrontBadge tone="neutral" className="proto-brand-pill">
              {product.brand || "Jenix India"}
            </StorefrontBadge>
            <StorefrontBadge
              tone={statusTone(product.stockStatus)}
              className={`proto-stock-pill ${statusTone(product.stockStatus)}`}
            >
              {statusLabel(product.stockStatus)}
            </StorefrontBadge>
          </div>

          <h1>{product.title}</h1>
          <p className="proto-product-subtitle">
            SKU: {product.sku || "--"} {product.modelNumber ? `| Model: ${product.modelNumber}` : ""}
          </p>

          <div className="proto-price-row proto-price-row-large">
            <strong>{currency(nextVisiblePrice)}</strong>
            {nextCompareAtPrice && nextCompareAtPrice > nextVisiblePrice ? (
              <span>{currency(nextCompareAtPrice)}</span>
            ) : null}
            {saveAmount > 0 ? (
              <mark>Save {currency(saveAmount)}</mark>
            ) : null}
          </div>

          <p className="proto-tax-line">
            Exclusive of {Number(product.gstRate || 0)}% GST
            {saveAmount > 0 ? <> &nbsp;|&nbsp; GST amount: {currency(Math.round(nextVisiblePrice * Number(product.gstRate || 0) / 100))}</> : null}
          </p>
          <p className="proto-gst-invoice-line">&#10003; GST Invoice will be generated after payment</p>

          {featureChips.length > 0 ? (
            <div className="proto-feature-chip-row">
              {featureChips.map((feature) => (
                <span key={feature}>{feature}</span>
              ))}
            </div>
          ) : null}

          <div className="proto-quantity-row">
            <span>Qty</span>
            <div className="proto-qty-control">
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(Number(product.moq || 1), current - 1))}
              >
                -
              </button>
              <strong>{quantity}</strong>
              <button type="button" onClick={() => setQuantity((current) => current + 1)}>
                +
              </button>
            </div>
            <small>Min. order: {Number(product.moq || 1)} unit</small>
          </div>

          {effectiveBulkSlabs.length > 0 ? (
            <div className="proto-bulk-pricing">
              <p>Bulk Pricing Available</p>
              <div className="proto-bulk-grid">
                {effectiveBulkSlabs.map((slab) => (
                  <div key={`${slab.minQty}-${slab.unitPrice}`}>
                    <strong>{currency(slab.unitPrice)}</strong>
                    <span>{Number(slab.minQty)}+ units</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="proto-product-cta-row">
            {dealerOrderRequestFlow ? (
              <StorefrontButton
                type="submit"
                form="dealer-order-request-form"
                disabled={orderRequestLoading}
              >
                {orderRequestLoading ? "Submitting..." : "Place Order Request"}
              </StorefrontButton>
            ) : (
              <>
                <StorefrontButton
                  type="button"
                  onClick={() => handleCartAction("cart")}
                  disabled={Boolean(cartActionBusy) || showNotifyWhenAvailable}
                >
                  {cartActionBusy === "cart" ? "Adding..." : "Add to Cart"}
                </StorefrontButton>
                <StorefrontButton
                  type="button"
                  variant="dark"
                  onClick={() => handleCartAction("buy")}
                  disabled={Boolean(cartActionBusy) || showNotifyWhenAvailable}
                >
                  {cartActionBusy === "buy" ? "Starting..." : "Buy Now"}
                </StorefrontButton>
              </>
            )}
          </div>

          {cartActionNotice ? <p className="proto-inline-success">{cartActionNotice}</p> : null}
          {cartActionError ? <p className="proto-inline-error">{cartActionError}</p> : null}

          <StorefrontButton
            href={`https://wa.me/?text=${encodeURIComponent(`Enquiry for ${product.title} — Bulk / Installation Support`)}`}
            target="_blank"
            rel="noreferrer"
            variant="whatsapp"
            fullWidth
          >
            WhatsApp Enquiry for Bulk / Installation Support
          </StorefrontButton>

          <div className="proto-save-actions">
            {isAuthenticated ? (
              <StorefrontButton
                type="button"
                variant="light"
                onClick={() => {
                  setSaveLoading(true);
                  setSaveError("");
                  const action = saved ? removeSavedProduct(product.id) : saveProduct(product.id);
                  action
                    .then(() => {
                      setSaved((current) => !current);
                    })
                    .catch((requestError) => {
                      setSaveError(requestError.message || "Save action failed.");
                    })
                    .finally(() => {
                      setSaveLoading(false);
                    });
                }}
                disabled={saveLoading}
              >
                {saveLoading ? "Updating..." : saved ? "Saved in Account" : "Save Product"}
              </StorefrontButton>
            ) : (
              <StorefrontButton
                to={`/account/login?redirect=${encodeURIComponent(location.pathname)}`}
                variant="light"
              >
                Login to Save
              </StorefrontButton>
            )}
          </div>
          {saveError ? <p className="proto-inline-error">{saveError}</p> : null}

          {showNotifyWhenAvailable ? (
            <form className="proto-support-card" onSubmit={submitNotifyRequest}>
              <h3>Notify when available</h3>
              <p>This product is out of stock right now. Leave your contact details for an alert.</p>
              <div className="proto-inline-form">
                <StorefrontInput
                  value={notifyForm.customerName}
                  onChange={(event) =>
                    setNotifyForm((current) => ({
                      ...current,
                      customerName: event.target.value
                    }))
                  }
                  placeholder="Your name"
                />
                <StorefrontInput
                  type="email"
                  value={notifyForm.email}
                  onChange={(event) =>
                    setNotifyForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  placeholder="Email address"
                />
              </div>
              <div className="proto-inline-form">
                <StorefrontInput
                  value={notifyForm.mobile}
                  onChange={(event) =>
                    setNotifyForm((current) => ({
                      ...current,
                      mobile: event.target.value
                    }))
                  }
                  placeholder="Mobile number"
                />
                <StorefrontButton type="submit" variant="light" disabled={notifyLoading}>
                  {notifyLoading ? "Saving..." : "Notify Me"}
                </StorefrontButton>
              </div>
              {notifyError ? <p className="proto-inline-error">{notifyError}</p> : null}
              {notifyNotice ? <p className="proto-inline-success">{notifyNotice}</p> : null}
            </form>
          ) : null}

          <form
            className="proto-support-card"
            onSubmit={(event) => {
              event.preventDefault();
              setShippingLoading(true);
              setShippingError("");
              estimateShipping(product.slug, {
                pincode: pincode.trim(),
                quantity
              })
                .then((data) => {
                  setShipping(data);
                })
                .catch((requestError) => {
                  setShippingError(requestError.message || "Failed to calculate shipping.");
                })
                .finally(() => {
                  setShippingLoading(false);
                });
            }}
          >
            <h3>Estimate Shipping</h3>
            <div className="proto-inline-form">
              <StorefrontInput
                value={pincode}
                onChange={(event) => setPincode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="Enter pincode"
              />
              <StorefrontButton type="submit" variant="dark" disabled={shippingLoading}>
                {shippingLoading ? "Checking..." : "Check"}
              </StorefrontButton>
            </div>
            {shippingError ? <p className="proto-inline-error">{shippingError}</p> : null}
            {shipping?.options ? (
              <div className="proto-shipping-list">
                {shipping.options.map((option) => (
                  <div key={option.service} className="proto-shipping-item">
                    <strong>{option.label}</strong>
                    <span>
                      {option.etaDaysMin}-{option.etaDaysMax} days
                    </span>
                    <em>{currency(option.shippingCharge)}</em>
                  </div>
                ))}
              </div>
            ) : null}
          </form>

          {dealerOrderRequestFlow ? (
            <form id="dealer-order-request-form" className="proto-support-card" onSubmit={submitDealerOrderRequest}>
              <h3>Dealer Order Request</h3>
              <p>
                This account uses offline approval and bank-transfer payment. Submit the request and the admin team will approve it before payment proof upload.
              </p>
              <div className="proto-form-grid">
                <StorefrontInput
                  value={orderRequestForm.companyName}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      companyName: event.target.value
                    }))
                  }
                  placeholder="Company name"
                  required
                />
                <StorefrontInput
                  value={orderRequestForm.gstin}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      gstin: event.target.value
                    }))
                  }
                  placeholder="GSTIN"
                />
                <StorefrontInput
                  value={orderRequestForm.name}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Contact name"
                  required
                />
                <StorefrontInput
                  value={orderRequestForm.mobile}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      mobile: event.target.value
                    }))
                  }
                  placeholder="Mobile"
                  required
                />
                <StorefrontInput
                  type="email"
                  value={orderRequestForm.email}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  placeholder="Email"
                  required
                />
                <StorefrontSelect
                  value={orderRequestForm.shippingMethod}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      shippingMethod: event.target.value
                    }))
                  }
                >
                  <option value="standard">Standard Delivery</option>
                  <option value="transport">Transport</option>
                  <option value="manual_delivery">Manual Delivery</option>
                  <option value="self_pickup">Self Pickup</option>
                </StorefrontSelect>
                <StorefrontInput
                  value={orderRequestForm.addressLine1}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      addressLine1: event.target.value
                    }))
                  }
                  placeholder="Address line 1"
                  required
                />
                <StorefrontInput
                  value={orderRequestForm.addressLine2}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      addressLine2: event.target.value
                    }))
                  }
                  placeholder="Address line 2"
                />
                <StorefrontInput
                  value={orderRequestForm.city}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      city: event.target.value
                    }))
                  }
                  placeholder="City"
                  required
                />
                <StorefrontInput
                  value={orderRequestForm.state}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      state: event.target.value
                    }))
                  }
                  placeholder="State"
                  required
                />
                <StorefrontInput
                  value={orderRequestForm.stateCode}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      stateCode: event.target.value
                    }))
                  }
                  placeholder="State code"
                  required
                />
                <StorefrontInput
                  value={orderRequestForm.pincode}
                  onChange={(event) =>
                    setOrderRequestForm((current) => ({
                      ...current,
                      pincode: event.target.value
                    }))
                  }
                  placeholder="Pincode"
                  required
                />
              </div>
              {orderRequestNotice ? <p className="proto-inline-success">{orderRequestNotice}</p> : null}
              {orderRequestError ? <p className="proto-inline-error">{orderRequestError}</p> : null}
            </form>
          ) : null}
        </div>
      </section>

      <section className="proto-section proto-tabs-card">
        <div className="proto-tab-row">
          <button type="button" className={tab === "keyFeatures" ? "active" : ""} onClick={() => setTab("keyFeatures")}>
            Key Features
          </button>
          <button type="button" className={tab === "description" ? "active" : ""} onClick={() => setTab("description")}>
            Description
          </button>
          <button type="button" className={tab === "specifications" ? "active" : ""} onClick={() => setTab("specifications")}>
            Specifications
          </button>
          <button type="button" className={tab === "downloads" ? "active" : ""} onClick={() => setTab("downloads")}>
            Downloads
          </button>
        </div>

        {tab === "keyFeatures" ? (
          <ul className="proto-feature-list">
            {(keyFeatures.length > 0
              ? keyFeatures
              : ["Key buying highlights for this product are being prepared."]).map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        ) : null}

        {tab === "description" ? (
          <p className="proto-tab-copy">
            {product.fullDescription ||
              "A detailed product description is being prepared. Contact the store if you need help validating fit, specs, or installation needs."}
          </p>
        ) : null}

        {tab === "specifications" ? (
          <div className="proto-spec-table">
            {specs.length > 0 ? (
              specs.map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))
            ) : (
              <p className="proto-tab-copy">Specifications are not available for this product yet.</p>
            )}
          </div>
        ) : null}

        {tab === "downloads" ? (
          <div className="proto-download-list">
            {downloads.length > 0 ? (
              downloads.map((download) => (
                <a key={`${download.title}-${download.url}`} href={download.url} target="_blank" rel="noreferrer">
                  {download.title}
                </a>
              ))
            ) : (
              <p className="proto-tab-copy">Datasheet or downloads are not uploaded yet.</p>
            )}
          </div>
        ) : null}
      </section>

      {recommendationError ? <StorefrontAlert tone="warning">{recommendationError}</StorefrontAlert> : null}

      <ProductCarousel title="Related Products" items={recGroups.related} />
      <ProductCarousel title="Frequently Bought Together" items={recGroups.frequentlyBoughtTogether} />
      <ProductCarousel title="Accessories" items={recGroups.accessories} />

      <section className="proto-section">
        <StorefrontSectionHeader title="Helpful Guides" />
        {guides.length > 0 ? (
          <div className="proto-guide-scroller">
            {guides.map((guide) => (
              <Link key={guide.id} to={`/guides/${guide.slug}`} className="proto-guide-card">
                <span>{guide.category?.name || "Guide"}</span>
                <strong>{guide.title}</strong>
                <p>
                  {guide.excerpt ||
                    "Read the full guide for buying, installation, and troubleshooting support."}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <StorefrontAlert>
            No linked guide is attached to this product yet. Browse the full guides
            library or contact the team for buying help.
          </StorefrontAlert>
        )}
      </section>

      <StorefrontStickyActionBar className="proto-mobile-product-bar">
        <div>
          <strong>{currency(nextVisiblePrice)}</strong>
          <span>+{Number(product.gstRate || 0)}% GST</span>
        </div>
        {dealerOrderRequestFlow ? (
          <StorefrontButton
            type="submit"
            form="dealer-order-request-form"
            disabled={orderRequestLoading}
          >
            {orderRequestLoading ? "Submitting..." : "Order Request"}
          </StorefrontButton>
        ) : (
          <>
            <StorefrontButton
              type="button"
              onClick={() => handleCartAction("cart")}
              disabled={Boolean(cartActionBusy) || showNotifyWhenAvailable}
            >
              Cart
            </StorefrontButton>
            <StorefrontButton
              type="button"
              variant="dark"
              onClick={() => handleCartAction("buy")}
              disabled={Boolean(cartActionBusy) || showNotifyWhenAvailable}
            >
              Buy
            </StorefrontButton>
          </>
        )}
      </StorefrontStickyActionBar>
    </main>
  );
}
