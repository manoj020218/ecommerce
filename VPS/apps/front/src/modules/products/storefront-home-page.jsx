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
          <span>{String(category.name || "C").slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <span>{category.name}</span>
    </Link>
  );
}

function ProductRailCard({ product, busy, onAddToCart }) {
  const price = visiblePrice(product);
  const comparePrice = compareAtPrice(product);
  const discountAmount =
    comparePrice && comparePrice > price ? comparePrice - price : 0;

  return (
    <Link to={`/products/${product.slug}`} className="proto-product-card">
      <div className="proto-product-media">
        {Array.isArray(product.images) && product.images[0] ? (
          <img src={product.images[0]} alt={product.title} loading="lazy" />
        ) : (
          <div className="proto-product-placeholder">{product.brand || "Jenix"}</div>
        )}
        {discountAmount > 0 ? (
          <span className="proto-product-flag">
            Save {currency(discountAmount)}
          </span>
        ) : null}
      </div>
      <div className="proto-product-copy">
        <p>{product.brand || "Jenix India"}</p>
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
          action={<Link to="/products">Browse catalog</Link>}
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
          action={<Link to="/products">View all</Link>}
        />
        {loading ? (
          <StorefrontLoadingState label="Loading products..." />
        ) : (
          <div className="proto-product-scroller">
            {featuredProducts.map((product) => (
              <ProductRailCard
                key={product.id}
                product={product}
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
          action={<Link to="/products">Explore all</Link>}
        />
        {loading ? (
          <StorefrontLoadingState label="Loading new arrivals..." />
        ) : (
          <div className="proto-product-grid">
            {latestProducts.map((product) => (
              <ProductRailCard
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
          title="Helpful Guides"
          action={<Link to="/guides">Read more</Link>}
        />
        {blogs.length > 0 ? (
          <div className="proto-guide-scroller">
            {blogs.map((blog) => (
              <Link key={blog.id} to={`/guides/${blog.slug}`} className="proto-guide-card">
                <span>{blog.category?.name || "Guide"}</span>
                <strong>{blog.title}</strong>
                <p>
                  {blog.excerpt ||
                    "Read the full guide for buying, installation, and troubleshooting support."}
                </p>
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
