import { useEffect, useMemo, useRef, useState } from "react";
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
import { watchdog } from "../../shared/watchdog-client";

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

const RECENT_VIEWED_KEY = "jenix_recently_viewed";
const RECENT_MAX = 12;

function readRecentViewed() {
  try { return JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) || "[]"); } catch { return []; }
}

function pushRecentViewed(product) {
  try {
    const item = {
      id: product.id,
      slug: product.slug,
      title: product.title,
      imageUrl: Array.isArray(product.images) && product.images[0] ? resolveImg(product.images[0]) : "",
      price: visiblePrice(product)
    };
    const existing = readRecentViewed().filter((r) => r.id !== item.id);
    const next = [item, ...existing].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(next));
  } catch {}
}

function RecentlyViewedCarousel({ currentProductId, onAddToCart, busyProductId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(readRecentViewed().filter((r) => r.id !== currentProductId));
  }, [currentProductId]);

  if (items.length === 0) return null;

  return (
    <section className="proto-section">
      <StorefrontSectionHeader title="Recently Viewed" />
      <div className="proto-auto-carousel-shell">
        <div className="proto-auto-carousel-track">
          {items.map((item) => (
            <Link key={item.id} to={`/products/${item.slug}`} className="proto-recent-card">
              <div className="proto-recent-card-media">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} loading="lazy" />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", color: "#9ca3af", fontSize: 11 }}>
                    Jenix
                  </div>
                )}
              </div>
              <div className="proto-recent-card-body">
                <p>{item.title}</p>
                <strong>{currency(item.price)}</strong>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
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
      <div className="proto-auto-carousel-shell">
        <div className="proto-auto-carousel-track">
          {items.map((product) => (
            <ProductMiniCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

function dedupeProductsById(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const product of list) {
      if (!product?.id || seen.has(product.id)) continue;
      seen.add(product.id);
      merged.push(product);
    }
  }
  return merged;
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
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const lastTapTime = useRef(0);

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
        watchdog.trackProductView(data.id);
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
    if (product?.id) pushRecentViewed(product);
  }, [product?.id]);

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
      .catch(() => {
        // Non-critical background check (e.g. a stale/expired token, which
        // self-clears via SESSION_EXPIRED_EVENT) — fail quietly, not with a
        // raw backend error message on the page.
        if (mounted) {
          setSaved(false);
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
  const maxOrderableQty = Math.max(1, Number(product?.maxOrderableQty ?? 1000));
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
      watchdog.trackAddToCartClick(product.id);
      await addCartItem({
        ...buildCartContext(isAuthenticated),
        productId: product.id,
        qty: quantity
      });
      watchdog.trackAddToCartSuccess(product.id);
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
    <main className="proto-main-shell proto-product-page" onClick={() => setShareOpen(false)}>
      {fullscreenOpen ? (
        <div className="proto-product-fullscreen-overlay" onClick={() => setFullscreenOpen(false)}>
          <button className="proto-fullscreen-close" aria-label="Close">✕</button>
          <img src={activeImage} alt={product.title} />
          <p className="proto-fullscreen-hint">Pinch to zoom · Tap to close</p>
        </div>
      ) : null}

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
          <div
            className="proto-product-main-image"
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
              touchStartY.current = e.touches[0].clientY;
            }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              const dy = e.changedTouches[0].clientY - touchStartY.current;
              if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                const idx = images.indexOf(activeImage);
                if (dx < 0 && idx < images.length - 1) setSelectedImage(images[idx + 1]);
                if (dx > 0 && idx > 0) setSelectedImage(images[idx - 1]);
              } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                const now = Date.now();
                if (now - lastTapTime.current < 300) setFullscreenOpen(true);
                lastTapTime.current = now;
              }
            }}
          >
            {activeImage ? (
              <img src={activeImage} alt={product.title} draggable={false} />
            ) : (
              <div className="proto-product-placeholder large">Product image</div>
            )}
            {discountPct > 0 ? (
              <span className="proto-product-flag">-{discountPct}% OFF</span>
            ) : null}

            {/* Social share button — replaces SKU overlay */}
            <button
              type="button"
              className="proto-share-badge"
              aria-label="Share product"
              onClick={(e) => { e.stopPropagation(); setShareOpen((v) => !v); }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>

            {shareOpen ? (
              <div className="proto-share-panel" onClick={(e) => e.stopPropagation()}>
                <div className="proto-share-panel-title">Share this product</div>
                <div className="proto-share-row">
                  <a className="proto-share-btn" href={`https://wa.me/?text=${encodeURIComponent(`Check out this product: ${product.title} — ${window.location.href}`)}`} target="_blank" rel="noreferrer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </a>
                  <a className="proto-share-btn" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noreferrer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook
                  </a>
                  <a className="proto-share-btn" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(product.title)}&url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noreferrer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.735-8.835L1.254 2.25H8.08l4.258 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    X (Twitter)
                  </a>
                  <a className="proto-share-btn" href={`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(product.title)}`} target="_blank" rel="noreferrer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#2CA5E0"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    Telegram
                  </a>
                  <button
                    className="proto-share-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href).then(() => {
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      });
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    Copy Link
                  </button>
                  {copiedLink ? <div className="proto-share-copy-notice">✓ Link copied!</div> : null}
                </div>
              </div>
            ) : null}
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

          {showNotifyWhenAvailable ? (
            <p className="proto-tax-line" style={{ color: "#b91c1c", fontWeight: 600 }}>
              Currently out of stock — pricing will show again once restocked.
            </p>
          ) : (
            <>
              <div className="proto-price-row proto-price-row-large">
                <strong>{currency(nextVisiblePrice)}</strong>
                {nextCompareAtPrice && nextCompareAtPrice > nextVisiblePrice ? (
                  <span>{currency(nextCompareAtPrice)}</span>
                ) : null}
                {saveAmount > 0 ? (
                  <mark>Save {currency(saveAmount)}</mark>
                ) : null}
              </div>

              {product.priceIncludesGst ? (
                <p className="proto-tax-line" style={{ color: "#15803d", fontWeight: 600 }}>
                  <span style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 6, padding: "2px 8px", fontSize: 12, marginRight: 6 }}>Incl. GST</span>
                  Price includes {Number(product.gstRate || 0)}% GST
                  {Number(product.gstRate || 0) > 0 ? <> &nbsp;·&nbsp; GST: {currency(Math.round(nextVisiblePrice - nextVisiblePrice / (1 + Number(product.gstRate) / 100)))}</> : null}
                </p>
              ) : (
                <p className="proto-tax-line">
                  Excl. {Number(product.gstRate || 0)}% GST — added at checkout
                  {saveAmount > 0 ? <> &nbsp;|&nbsp; GST: {currency(Math.round(nextVisiblePrice * Number(product.gstRate || 0) / 100))}</> : null}
                </p>
              )}
              <p className="proto-gst-invoice-line">&#10003; GST Invoice will be generated after payment</p>
            </>
          )}
          {product.shippingIncluded ? (
            <p className="proto-shipping-info-line proto-shipping-included">
              <span className="proto-shipping-chip">Free Shipping</span>
              Shipping is included in the price — no extra charge at checkout.
            </p>
          ) : (
            <p className="proto-shipping-info-line">
              Shipping calculated at checkout based on your location.
            </p>
          )}

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
              <button
                type="button"
                disabled={quantity >= maxOrderableQty}
                onClick={() => setQuantity((current) => Math.min(maxOrderableQty, current + 1))}
              >
                +
              </button>
            </div>
            <small>
              Min. order: {Number(product.moq || 1)} unit
              {quantity >= maxOrderableQty ? " — maximum orderable quantity reached" : ""}
            </small>
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

          <div className="proto-wa-save-row">
            <StorefrontButton
              href={`https://wa.me/?text=${encodeURIComponent(`I have an enquiry about this product: ${product.title} — ${window.location.href}`)}`}
              target="_blank"
              rel="noreferrer"
              variant="whatsapp"
            >
              WhatsApp Enquiry
            </StorefrontButton>
            {isAuthenticated ? (
              <StorefrontButton
                type="button"
                variant="light"
                onClick={() => {
                  setSaveLoading(true);
                  setSaveError("");
                  const action = saved ? removeSavedProduct(product.id) : saveProduct(product.id);
                  action
                    .then(() => { setSaved((current) => !current); })
                    .catch((requestError) => {
                      setSaveError(
                        requestError.status === 401
                          ? "Your session has expired — please log in again to save products."
                          : "Couldn't save this product. Please try again."
                      );
                    })
                    .finally(() => { setSaveLoading(false); });
                }}
                disabled={saveLoading}
              >
                {saveLoading ? "…" : saved ? "❤ Saved" : "Save"}
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
          keyFeatures.length > 0 ? (
            <ul className="proto-feature-list">
              {keyFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          ) : product.fullDescription || product.shortDescription ? (
            <div
              className="proto-tab-copy"
              dangerouslySetInnerHTML={{ __html: product.fullDescription || product.shortDescription }}
            />
          ) : (
            <p className="proto-tab-copy">
              Key buying highlights for this product are being prepared.
            </p>
          )
        ) : null}

        {tab === "description" ? (
          product.fullDescription ? (
            <div
              className="proto-tab-copy"
              dangerouslySetInnerHTML={{ __html: product.fullDescription }}
            />
          ) : (
            <p className="proto-tab-copy">
              A detailed product description is being prepared. Contact the store if you need help validating fit, specs, or installation needs.
            </p>
          )
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

      <ProductCarousel
        title="Related Products"
        items={dedupeProductsById(recGroups.related, recGroups.mostVisited).slice(0, 12)}
      />
      <ProductCarousel title="Frequently Bought Together" items={recGroups.frequentlyBoughtTogether} />
      <ProductCarousel title="Accessories" items={recGroups.accessories} />

      <RecentlyViewedCarousel currentProductId={product.id} />

      {(() => {
        const linked = [
          ...(Array.isArray(recGroups.related) ? recGroups.related : []),
          ...(Array.isArray(recGroups.frequentlyBoughtTogether) ? recGroups.frequentlyBoughtTogether : []),
          ...(Array.isArray(recGroups.accessories) ? recGroups.accessories : [])
        ];
        if (linked.length === 0) return null;
        const displayLinked = linked.length > 4 ? [...linked, ...linked] : linked;
        return (
        <section className="proto-section">
          <StorefrontSectionHeader title="Linked Products" />
          <div className="proto-auto-carousel-shell">
            <div className="proto-auto-carousel-track" style={linked.length <= 4 ? { animation: "none" } : {}}>
              {displayLinked
                .map((p, idx) => (
                  <Link key={`linked-${p.id}-${idx}`} to={`/products/${p.slug}`} className="proto-recent-card">
                    <div className="proto-recent-card-media">
                      {Array.isArray(p.images) && p.images[0] ? (
                        <img src={resolveImg(p.images[0])} alt={p.title} loading="lazy" />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", color: "#9ca3af", fontSize: 11 }}>Jenix</div>
                      )}
                    </div>
                    <div className="proto-recent-card-body">
                      <p>{p.title}</p>
                      <strong>{currency(visiblePrice(p))}</strong>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </section>
        );
      })()}

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
          <span style={product.priceIncludesGst ? { color: "#15803d", fontWeight: 600 } : {}}>
            {product.priceIncludesGst ? `Incl. ${Number(product.gstRate || 0)}% GST` : `+${Number(product.gstRate || 0)}% GST`}
          </span>
          {product.shippingIncluded ? (
            <span className="proto-shipping-chip proto-shipping-chip-sm">Free Shipping</span>
          ) : null}
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
