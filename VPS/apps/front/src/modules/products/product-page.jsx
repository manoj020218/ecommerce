import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { listSavedProducts, removeSavedProduct, saveProduct } from "../account/account.api";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  estimateShipping,
  getProduct,
  getProductPageBundle,
  getProductRecommendations
} from "./products.api";

function currency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
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
    return "tone-green";
  }
  if (stockStatus === "low_stock") {
    return "tone-amber";
  }
  if (stockStatus === "backorder") {
    return "tone-blue";
  }
  return "tone-red";
}

function ProductMiniCard({ product }) {
  const imageUrl = Array.isArray(product.images) && product.images[0] ? product.images[0] : null;

  return (
    <Link to={`/products/${product.slug}`} className="mini-card">
      <div className="mini-media">
        {imageUrl ? <img src={imageUrl} alt={product.title} loading="lazy" /> : <span>No image</span>}
      </div>
      <div className="mini-body">
        <p>{product.title}</p>
        <strong>{currency(product.salePrice)}</strong>
      </div>
    </Link>
  );
}

function ProductCarousel({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <section className="section-block">
      <div className="section-head">
        <h3>{title}</h3>
      </div>
      <div className="carousel-track">
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
  const { customer, isAuthenticated } = useCustomerSession();
  const [product, setProduct] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState("keyFeatures");
  const [pincode, setPincode] = useState("");
  const [shipping, setShipping] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    setRecommendationError("");
    setShipping(null);
    setShippingError("");

    getProduct(slug)
      .then((data) => {
        if (!mounted) {
          return;
        }
        setProduct(data);
        setQuantity(Math.max(1, Number(data.moq || 1)));
        setBreadcrumb([
          { label: "Home", href: "/" },
          { label: "Products", href: "/" },
          { label: data.title, href: `/products/${data.slug}` }
        ]);
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || "Failed to load product.");
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
        if (bundle?.recommendations) {
          setRecommendations(bundle.recommendations);
        }
      })
      .catch(async (err) => {
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
              err.message || "Recommendations are temporarily unavailable."
            );
          }
        }
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

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

  const effectiveBulkSlabs = useMemo(() => {
    if (!product) {
      return [];
    }
    const slabs = Array.isArray(product.bulkPriceSlabs) ? [...product.bulkPriceSlabs] : [];
    if (slabs.length === 0) {
      return [];
    }
    return slabs.sort((a, b) => Number(a.minQty) - Number(b.minQty));
  }, [product]);

  const keyFeatures = Array.isArray(product?.keyFeatures) ? product.keyFeatures : [];
  const specs = product?.specifications && typeof product.specifications === "object"
    ? Object.entries(product.specifications)
    : [];
  const downloads = Array.isArray(product?.downloads) ? product.downloads : [];
  const recGroups = recommendations?.recommendationGroups || {};
  const recentSearches = recommendations?.recently?.searches || [];
  const recentViewed = recommendations?.recently?.viewedProducts || [];
  const guides = Array.isArray(recommendations?.guides) ? recommendations.guides : [];

  if (loading) {
    return <main className="front-shell"><div className="state-box">Loading product...</div></main>;
  }

  if (error || !product) {
    return (
      <main className="front-shell">
        <div className="state-box error">{error || "Product not found."}</div>
        <Link to="/" className="back-link">
          Back to products
        </Link>
      </main>
    );
  }

  return (
    <main className="front-shell product-view">
      <header className="compact-header">
        <Link to="/" className="back-link">
          Back
        </Link>
        <div className="header-actions">
          <p>Jenix Product Detail</p>
          <Link to={isAuthenticated ? "/account" : `/account/login?redirect=${encodeURIComponent(location.pathname)}`} className="inline-link">
            {isAuthenticated
              ? `Account: ${(customer?.name || "Customer").split(" ")[0]}`
              : "Customer Login"}
          </Link>
        </div>
      </header>

      <nav className="breadcrumb">
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

      <section className="hero-grid">
        <div className="gallery-card">
          <div className="hero-image">
            {Array.isArray(product.images) && product.images[0] ? (
              <img src={product.images[0]} alt={product.title} />
            ) : (
              <div className="hero-image-placeholder">Product image</div>
            )}
          </div>
          <div className="thumb-row">
            {(Array.isArray(product.images) ? product.images : []).slice(0, 4).map((img, index) => (
              <button key={`${img}-${index}`} type="button" className="thumb-pill">
                <img src={img} alt={`${product.title} ${index + 1}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="detail-card">
          <div className="availability-row">
            <span className="sku-text">SKU: {product.sku}</span>
            <span className={`status-pill ${statusTone(product.stockStatus)}`}>
              {statusLabel(product.stockStatus)}
            </span>
          </div>

          <h1>{product.title}</h1>
          <p className="muted-text">{product.shortDescription || "Industrial security product from Jenix India."}</p>

          <div className="price-row">
            <strong>{currency(product.salePrice)}</strong>
            {Number(product.basePrice || 0) > Number(product.salePrice || 0) ? (
              <span>{currency(product.basePrice)}</span>
            ) : null}
          </div>

          <p className="gst-note">
            GST {Number(product.gstRate || 0)}% applicable. GST invoice is provided for business purchases.
          </p>

          <div className="qty-block">
            <p>Quantity</p>
            <div className="qty-controls">
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(Number(product.moq || 1), current - 1))}
              >
                -
              </button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((current) => current + 1)}>
                +
              </button>
            </div>
            <small>MOQ: {Number(product.moq || 1)}</small>
          </div>

          {effectiveBulkSlabs.length > 0 ? (
            <div className="bulk-box">
              <h4>Bulk pricing slabs</h4>
              <div className="bulk-grid">
                {effectiveBulkSlabs.map((slab) => (
                  <div key={`${slab.minQty}-${slab.unitPrice}`}>
                    <strong>{currency(slab.unitPrice)}</strong>
                    <span>{Number(slab.minQty)}+ qty</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="cta-grid">
            <button type="button" className="btn primary">Add to Cart</button>
            <button type="button" className="btn dark">Buy Now</button>
          </div>
          {isAuthenticated ? (
            <div className="save-row">
              <button
                type="button"
                className="btn secondary"
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
                {saveLoading
                  ? "Updating..."
                  : saved
                    ? "Saved in Account"
                    : "Save Product"}
              </button>
              {saveError ? <span className="muted-error inline-error">{saveError}</span> : null}
            </div>
          ) : (
            <div className="save-row">
              <Link
                to={`/account/login?redirect=${encodeURIComponent(location.pathname)}`}
                className="btn secondary"
              >
                Login to Save
              </Link>
            </div>
          )}
          <a className="btn whatsapp" href={`https://wa.me/?text=${encodeURIComponent(`Need details for ${product.title}`)}`}>
            WhatsApp Enquiry
          </a>

          <form
            className="shipping-box"
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
                .catch((err) => {
                  setShippingError(err.message || "Failed to calculate shipping.");
                })
                .finally(() => {
                  setShippingLoading(false);
                });
            }}
          >
            <h4>Estimate shipping</h4>
            <div className="shipping-input-row">
              <input
                value={pincode}
                onChange={(event) => setPincode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="Enter 6-digit pincode"
              />
              <button type="submit" className="btn secondary" disabled={shippingLoading}>
                {shippingLoading ? "Checking..." : "Check"}
              </button>
            </div>
            {shippingError ? <p className="muted-error">{shippingError}</p> : null}
            {shipping?.options ? (
              <div className="shipping-results">
                {shipping.options.map((option) => (
                  <div key={option.service} className="shipping-row">
                    <p>{option.label}</p>
                    <span>
                      {option.etaDaysMin}-{option.etaDaysMax} days
                    </span>
                    <strong>{currency(option.shippingCharge)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </form>
        </div>
      </section>

      <section className="section-block tabs-block">
        <div className="tab-row">
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
          <ul className="feature-list">
            {(keyFeatures.length > 0 ? keyFeatures : ["Product highlights will be updated by admin."]).map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        ) : null}

        {tab === "description" ? (
          <p className="tab-description">
            {product.fullDescription || "Detailed product description will appear here."}
          </p>
        ) : null}

        {tab === "specifications" ? (
          <div className="spec-grid">
            {specs.length > 0 ? (
              specs.map(([key, value]) => (
                <div key={key} className="spec-row">
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))
            ) : (
              <p className="tab-description">Specifications are not available for this product yet.</p>
            )}
          </div>
        ) : null}

        {tab === "downloads" ? (
          <div className="download-grid">
            {downloads.length > 0 ? (
              downloads.map((download) => (
                <a key={`${download.title}-${download.url}`} href={download.url} target="_blank" rel="noreferrer">
                  {download.title}
                </a>
              ))
            ) : (
              <p className="tab-description">Datasheet or downloads are not uploaded yet.</p>
            )}
          </div>
        ) : null}
      </section>

      {recommendationError ? <div className="state-box warning">{recommendationError}</div> : null}

      {recentSearches.length > 0 || recentViewed.length > 0 ? (
        <section className="section-block">
          <div className="section-head">
            <h3>Recently searched / viewed</h3>
          </div>
          {recentSearches.length > 0 ? (
            <div className="search-chip-row">
              {recentSearches.map((row) => (
                <span key={row.id} className="search-chip">
                  {row.query}
                </span>
              ))}
            </div>
          ) : null}
          {recentViewed.length > 0 ? (
            <div className="carousel-track">
              {recentViewed.map((row) => (
                <ProductMiniCard key={`recent-${row.id}`} product={row} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <ProductCarousel title="Related products" items={recGroups.related} />
      <ProductCarousel title="Frequently bought together" items={recGroups.frequentlyBoughtTogether} />
      <ProductCarousel title="Accessories" items={recGroups.accessories} />
      <ProductCarousel title="Top searched products" items={recGroups.topSearched} />
      <ProductCarousel title="Most visited products" items={recGroups.mostVisited} />

      <section className="section-block">
        <div className="section-head">
          <h3>Helpful guides</h3>
        </div>
        <div className="guide-track">
          {(guides.length > 0
            ? guides
            : [
                { id: "guide-1", title: "How to select CCTV for a retail store?" },
                { id: "guide-2", title: "IP camera setup checklist for first-time buyers." }
              ]
          ).map((guide) => (
            <article key={guide.id} className="guide-card">
              <strong>{guide.title}</strong>
              <p>Knowledge base content will be integrated in Phase 13.</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
