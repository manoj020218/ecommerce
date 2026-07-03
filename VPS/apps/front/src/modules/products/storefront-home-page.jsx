import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontSectionHeader,
  StorefrontLoadingState
} from "../../shared/storefront/storefront-ui";
import { notifyStorefrontCartUpdated, buildCartContext } from "../cart/cart.utils";
import { listBlogs } from "../blogs/blogs.api";
import { WebsiteBuyerLeadSection } from "../website-leads/website-buyer-lead-section";
import {
  addCartItem,
  listCategories,
  listProducts
} from "./products.api";
import { usePublicSettings } from "../settings/public-settings-context";

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

function buildWhatsAppLink(number, message) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

function upsertMetaTag(name, content, attribute = "name") {
  if (!content) {
    return;
  }

  let tag = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, name);
    document.head.append(tag);
  }

  tag.setAttribute("content", content);
}

function upsertCanonical(url) {
  if (!url) {
    return;
  }

  let tag = document.head.querySelector('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.append(tag);
  }

  tag.setAttribute("href", url);
}

function CategoryTile({ category }) {
  return (
    <Link to={`/categories/${category.slug}`} className="proto-category-tile">
      <div className="proto-category-icon">
        {category.imageUrl ? (
          <img src={category.imageUrl} alt={category.name} loading="lazy" />
        ) : (
          <svg className="proto-category-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        )}
      </div>
      <span>{category.name}</span>
    </Link>
  );
}

function badgeClass(label) {
  if (!label) return "proto-product-flag";
  const l = label.toLowerCase();
  if (l === "new") return "proto-product-flag proto-flag-green";
  if (l === "popular" || l === "trending" || l === "hot") return "proto-product-flag proto-flag-yellow";
  if (l === "featured") return "proto-product-flag proto-flag-blue";
  return "proto-product-flag";
}

function ProductRailCard({ product, categories, busy, onAddToCart }) {
  const price = visiblePrice(product);
  const comparePrice = compareAtPrice(product);
  const discountPct =
    comparePrice && comparePrice > price
      ? Math.round(((comparePrice - price) / comparePrice) * 100)
      : 0;

  const categoryName =
    product.categoryId && Array.isArray(categories)
      ? (categories.find((c) => c.id === product.categoryId)?.name || "")
      : "";
  const metaLine = [product.brand, categoryName].filter(Boolean).join(" · ");

  const label = product.productLabel || (discountPct > 0 ? `-${discountPct}%` : "");

  return (
    <Link to={`/products/${product.slug}`} className="proto-product-card">
      <div className="proto-product-media">
        {Array.isArray(product.images) && product.images[0] ? (
          <img src={resolveImg(product.images[0])} alt={product.title} loading="lazy" />
        ) : (
          <div className="proto-product-placeholder">{product.brand || "Jenix"}</div>
        )}
        {label ? (
          <span className={badgeClass(product.productLabel || "")}>
            {label}
          </span>
        ) : null}
      </div>
      <div className="proto-product-copy">
        {metaLine ? <p>{metaLine}</p> : null}
        <h3>{product.title}</h3>
        <div className="proto-price-row">
          <strong>{currency(price)}</strong>
          {comparePrice && comparePrice > price ? <span>{currency(comparePrice)}</span> : null}
        </div>
        <small>+{Number(product.gstRate || 18)}% GST</small>
        <StorefrontButton
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onAddToCart(product);
          }}
          disabled={busy}
        >
          {busy ? "Adding..." : "Add to Cart"}
        </StorefrontButton>
      </div>
    </Link>
  );
}

function NewArrivalCard({ product, busy, onAddToCart }) {
  const price = visiblePrice(product);

  return (
    <Link to={`/products/${product.slug}`} className="proto-arrival-card">
      <div className="proto-arrival-media">
        {Array.isArray(product.images) && product.images[0] ? (
          <img src={resolveImg(product.images[0])} alt={product.title} loading="lazy" />
        ) : (
          <div className="proto-product-placeholder">{product.brand || "Jenix"}</div>
        )}
      </div>
      <div className="proto-arrival-copy">
        <p className="proto-arrival-brand">{product.brand || "Jenix"}</p>
        <h3>{product.title}</h3>
        <div className="proto-arrival-footer">
          <div>
            <strong>{currency(price)}</strong>
            <small>+{Number(product.gstRate || 18)}% GST</small>
          </div>
          <button
            type="button"
            className="proto-arrival-add"
            onClick={(event) => {
              event.preventDefault();
              onAddToCart(product);
            }}
            disabled={busy}
            aria-label="Add to cart"
          >
            {busy ? (
              <span>…</span>
            ) : (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </Link>
  );
}

function UspShieldIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function UspPackageIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function UspInvoiceIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function UspSupportIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

const TRUST_POINTS = [
  {
    title: "100% Genuine",
    copy: "Authorised products only",
    icon: <UspShieldIcon />
  },
  {
    title: "Pan India Shipping",
    copy: "Fast and tracked delivery",
    icon: <UspPackageIcon />
  },
  {
    title: "GST Invoice",
    copy: "Proper tax invoice for business",
    icon: <UspInvoiceIcon />
  },
  {
    title: "Expert Support",
    copy: "Installation guidance",
    icon: <UspSupportIcon />
  }
];

export function StorefrontHomePage() {
  const { settings: publicSettings } = usePublicSettings();
  const { isAuthenticated } = useCustomerSession();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyProductId, setBusyProductId] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      listCategories(),
      listProducts({}),
      listBlogs({ limit: 6 })
    ])
      .then(([categoryRows, productRows, blogRows]) => {
        if (!active) {
          return;
        }
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
        setProducts(Array.isArray(productRows) ? productRows : []);
        setBlogs(Array.isArray(blogRows) ? blogRows : []);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Failed to load the storefront.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const seoDefaults = publicSettings.seoDefaults || {};
    const storeName = publicSettings.storeProfile.storeName || "Jenix India";
    const homeMetaTitle = seoDefaults.homeMetaTitle || storeName;
    const canonicalRoot = String(seoDefaults.canonicalDomain || "").replace(/\/+$/, "");

    if (homeMetaTitle) {
      document.title = homeMetaTitle;
      upsertMetaTag("og:title", homeMetaTitle, "property");
    }

    if (seoDefaults.homeMetaDescription) {
      upsertMetaTag("description", seoDefaults.homeMetaDescription);
      upsertMetaTag("og:description", seoDefaults.homeMetaDescription, "property");
    }

    if (seoDefaults.defaultOgImageUrl) {
      upsertMetaTag("og:image", seoDefaults.defaultOgImageUrl, "property");
    }

    if (seoDefaults.searchConsoleVerification) {
      upsertMetaTag("google-site-verification", seoDefaults.searchConsoleVerification);
    }

    if (seoDefaults.bingVerification) {
      upsertMetaTag("msvalidate.01", seoDefaults.bingVerification);
    }

    if (canonicalRoot) {
      upsertCanonical(`${canonicalRoot}/`);
    }
  }, [publicSettings]);

  const featuredProduct = products[0] || null;
  const featuredProducts = useMemo(() => products.slice(0, 8), [products]);
  const latestProducts = useMemo(
    () => (products.length > 8 ? products.slice(8, 16) : products.slice(0, 8)),
    [products]
  );
  const topCategories = useMemo(() => categories.slice(0, 8), [categories]);
  const storeProfile = publicSettings.storeProfile || {};
  const contactInformation = publicSettings.contactInformation || {};
  const storeName = storeProfile.storeName || "Jenix India";
  const supportPhone =
    contactInformation.publicPhone || storeProfile.supportMobile || "";
  const supportWhatsApp =
    contactInformation.publicWhatsApp || storeProfile.whatsappNumber || "";
  const supportTiming =
    contactInformation.supportTiming || storeProfile.businessHours || "";
  const heroTitle =
    publicSettings.seoDefaults.homeMetaTitle === storeName
      ? "Smart Security & IoT Solutions"
      : publicSettings.seoDefaults.homeMetaTitle || "Smart Security & IoT Solutions";
  const heroDescription =
    publicSettings.seoDefaults.homeMetaDescription ||
    "Browse CCTV, smart locks, gate automation, networking, and business-ready security products.";

  const addProductToCart = async (product) => {
    setBusyProductId(product.id);
    setNotice("");

    try {
      await addCartItem({
        ...buildCartContext(isAuthenticated),
        productId: product.id,
        qty: 1
      });
      notifyStorefrontCartUpdated();
      setNotice(`${product.title} added to cart.`);
    } catch (requestError) {
      setNotice(requestError.message || "Unable to add this product to the cart.");
    } finally {
      setBusyProductId("");
    }
  };

  return (
    <main className="proto-main-shell proto-main-shell-home">
      <section className="proto-home-hero">
        <div className="proto-home-hero-copy">
          <span className="proto-home-kicker">New Arrival</span>
          <h1>{heroTitle}</h1>
          <p>
            {heroDescription}
            {supportTiming ? ` Support timing: ${supportTiming}.` : ""}
          </p>
          <div className="proto-home-actions">
            <StorefrontButton
              to={featuredProduct ? `/products/${featuredProduct.slug}` : "/products"}
            >
              Shop Now
            </StorefrontButton>
            <StorefrontButton to="/products" variant="light">
              View All
            </StorefrontButton>
            {supportWhatsApp ? (
              <StorefrontButton
                href={buildWhatsAppLink(
                  supportWhatsApp,
                  `Need help choosing products from ${storeName}.`
                )}
                target="_blank"
                rel="noreferrer"
                variant="light"
              >
                WhatsApp Help
              </StorefrontButton>
            ) : null}
          </div>
          <div className="proto-hero-dots">
            <span className="proto-hero-dot active" />
            <span className="proto-hero-dot" />
            <span className="proto-hero-dot" />
          </div>
        </div>

        <div className="proto-home-hero-feature">
          <div className="proto-home-feature-card">
            <strong>{featuredProduct?.title || "AI Face Recognition Access Terminal"}</strong>
            <p>
              {featuredProduct?.shortDescription ||
                "Temperature sensing, attendance, and access control for offices, schools, and factories."}
            </p>
            <div className="proto-home-feature-meta">
              <span>{featuredProduct ? currency(visiblePrice(featuredProduct)) : "Ready to Ship"}</span>
              {supportPhone ? <span>{supportPhone}</span> : null}
            </div>
          </div>
        </div>
      </section>

      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}
      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}

      <section className="proto-section">
        <StorefrontSectionHeader
          title="Shop by Category"
          action={<Link to="/products">View all →</Link>}
        />
        {loading ? (
          <StorefrontLoadingState label="Loading categories..." />
        ) : (
          <div className="proto-category-grid">
            {topCategories.map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
          </div>
        )}
      </section>

      <section className="proto-section proto-section-surface">
        <StorefrontSectionHeader
          title="Bestsellers"
          action={<Link to="/products">View all →</Link>}
        />
        {loading ? (
          <StorefrontLoadingState label="Loading products..." />
        ) : (
          <div className="proto-product-scroller">
            {featuredProducts.map((product) => (
              <ProductRailCard
                key={product.id}
                product={product}
                categories={categories}
                busy={busyProductId === product.id}
                onAddToCart={addProductToCart}
              />
            ))}
          </div>
        )}
      </section>

      <section className="proto-usp-strip">
        {TRUST_POINTS.map((item) => (
          <article key={item.title} className="proto-usp-card">
            <div className="proto-usp-icon">{item.icon}</div>
            <div className="proto-usp-text">
              <strong>{item.title}</strong>
              <p>{item.copy}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="proto-section">
        <StorefrontSectionHeader
          title="New Arrivals"
          action={<Link to="/products">View all →</Link>}
        />
        {loading ? (
          <StorefrontLoadingState label="Loading new arrivals..." />
        ) : (
          <div className="proto-product-grid">
            {latestProducts.map((product) => (
              <NewArrivalCard
                key={product.id}
                product={product}
                busy={busyProductId === product.id}
                onAddToCart={addProductToCart}
              />
            ))}
          </div>
        )}
      </section>

      <section className="proto-section proto-section-surface">
        <StorefrontSectionHeader
          title="Knowledge Base & Buying Guides"
          action={<Link to="/guides">All guides →</Link>}
        />
        {blogs.length > 0 ? (
          <div className="proto-guide-grid">
            {blogs.slice(0, 3).map((blog) => (
              <Link key={blog.id} to={`/guides/${blog.slug}`} className="proto-guide-card">
                <div className="proto-guide-card-image">
                  {blog.coverImageUrl ? (
                    <img src={blog.coverImageUrl} alt={blog.title} loading="lazy" />
                  ) : (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5" width="40" height="40" style={{ color: "#6b7280" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  )}
                </div>
                <div className="proto-guide-card-body">
                  <span className="proto-guide-badge">{blog.category?.name || "Guide"}</span>
                  <strong>{blog.title}</strong>
                  <p>
                    {blog.excerpt ||
                      "Resolution, features, installation — complete guide for buyers."}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <StorefrontAlert>
            Fresh buying guides are being prepared. Browse the catalog now and
            contact the team for product advice in the meantime.
          </StorefrontAlert>
        )}
      </section>

      <section className="proto-section proto-support-strip">
        <div>
          <span className="proto-home-kicker">Need project pricing?</span>
          <h2>Talk to Jenix for bulk orders, GST billing, and installation support.</h2>
        </div>
        <div className="proto-home-actions">
          {supportPhone ? (
            <StorefrontButton href={`tel:${supportPhone}`} variant="light">
              Call Store
            </StorefrontButton>
          ) : null}
          {supportWhatsApp ? (
            <StorefrontButton
              href={buildWhatsAppLink(
                supportWhatsApp,
                `Need bulk pricing from ${storeName}.`
              )}
              target="_blank"
              rel="noreferrer"
              variant="primary"
            >
              WhatsApp Enquiry
            </StorefrontButton>
          ) : null}
        </div>
      </section>

      <WebsiteBuyerLeadSection />
    </main>
  );
}
