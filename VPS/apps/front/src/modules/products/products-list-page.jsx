import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProducts, searchStorefront } from "./products.api";
import { usePublicSettings } from "../settings/public-settings-context";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { WebsiteBuyerLeadSection } from "../website-leads/website-buyer-lead-section";

function currency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
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

function buildWhatsAppLink(number, message) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
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

function ProductCard({ product }) {
  const imageUrl = Array.isArray(product.images) && product.images[0] ? product.images[0] : null;
  const nextVisiblePrice = visiblePrice(product);
  const nextCompareAtPrice = compareAtPrice(product);

  return (
    <Link to={`/products/${product.slug}`} className="product-card">
      <div className="product-card-media">
        {imageUrl ? (
          <img src={imageUrl} alt={product.title} loading="lazy" />
        ) : (
          <div className="product-card-placeholder">No image</div>
        )}
      </div>
      <div className="product-card-body">
        <p className="product-card-brand">{product.brand || "Jenix India"}</p>
        <h3>{product.title}</h3>
        <div className="product-card-price-row">
          <strong>{currency(nextVisiblePrice)}</strong>
          {nextCompareAtPrice && nextCompareAtPrice > nextVisiblePrice ? (
            <span>{currency(nextCompareAtPrice)}</span>
          ) : null}
        </div>
        {product?.pricing?.isB2BPrice ? <p className="product-card-brand">Approved dealer price</p> : null}
      </div>
    </Link>
  );
}

export function ProductsListPage() {
  const { customer, isAuthenticated } = useCustomerSession();
  const { settings: publicSettings } = usePublicSettings();
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [products, setProducts] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    const request = query
      ? searchStorefront({ q: query, limit: 20 })
      : listProducts({ q: "" });

    request
      .then((payload) => {
        if (!mounted) {
          return;
        }

        if (query) {
          const results = Array.isArray(payload?.results) ? payload.results : [];
          setProducts(
            results
              .filter((row) => row.entityType === "product" && row.product)
              .map((row) => row.product)
          );
          setBlogs(
            results
              .filter((row) => row.entityType === "blog" && row.blog)
              .map((row) => row.blog)
          );
          return;
        }

        setProducts(Array.isArray(payload) ? payload : []);
        setBlogs([]);
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || "Failed to load products.");
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
  }, [query]);

  useEffect(() => {
    const seoDefaults = publicSettings.seoDefaults || {};
    const homeMetaTitle = seoDefaults.homeMetaTitle || publicSettings.storeProfile.storeName;
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
      upsertMetaTag(
        "google-site-verification",
        seoDefaults.searchConsoleVerification
      );
    }

    if (seoDefaults.bingVerification) {
      upsertMetaTag("msvalidate.01", seoDefaults.bingVerification);
    }

    if (canonicalRoot) {
      upsertCanonical(`${canonicalRoot}/`);
    }
  }, [publicSettings]);

  const total = useMemo(() => products.length + blogs.length, [products, blogs]);
  const storeProfile = publicSettings.storeProfile || {};
  const contactInformation = publicSettings.contactInformation || {};
  const storeName = storeProfile.storeName || "Jenix India";
  const heroTitle =
    publicSettings.seoDefaults.homeMetaTitle === storeName
      ? "Security Product Store"
      : publicSettings.seoDefaults.homeMetaTitle || "Security Product Store";
  const heroDescription =
    publicSettings.seoDefaults.homeMetaDescription ||
    "Browse CCTV, networking, access control, and automation products.";
  const supportPhone =
    contactInformation.publicPhone || storeProfile.supportMobile || "";
  const supportWhatsApp =
    contactInformation.publicWhatsApp || storeProfile.whatsappNumber || "";
  const supportTiming =
    contactInformation.supportTiming || storeProfile.businessHours || "";

  return (
    <main className="front-shell">
      <header className="front-header">
        <div className="hero-kicker-row">
          <span className="eyebrow-chip">Storefront</span>
          <Link to={isAuthenticated ? "/account" : "/account/login"} className="inline-link">
            {isAuthenticated
              ? `Account: ${(customer?.name || "Customer").split(" ")[0]}`
              : "Customer Login"}
          </Link>
        </div>
        <div className="brand-block">
          <p>{storeName}</p>
          <h1>{heroTitle}</h1>
          <span className="hero-support-copy">
            {heroDescription}
            {supportTiming ? ` Support timing: ${supportTiming}.` : ""}
          </span>
        </div>

        <div className="chip-row">
          <Link to="/guides" className="inline-link">
            Browse Guides
          </Link>
          {supportPhone ? (
            <a href={`tel:${supportPhone}`} className="inline-link">
              Call Store
            </a>
          ) : null}
          {supportWhatsApp ? (
            <a
              href={buildWhatsAppLink(
                supportWhatsApp,
                `Need help choosing products from ${storeName}.`
              )}
              target="_blank"
              rel="noreferrer"
              className="inline-link"
            >
              WhatsApp Help
            </a>
          ) : null}
        </div>

        <form
          className="front-search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(searchText.trim());
          }}
        >
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by product, model, or keyword"
          />
          <button type="submit">Search</button>
        </form>
      </header>

      <section className="list-meta">
        <p>{query ? `Showing results for "${query}"` : "Browse all products"}</p>
        <strong>{total} items</strong>
      </section>

      {loading ? <div className="state-box">Loading products...</div> : null}
      {error ? <div className="state-box error">{error}</div> : null}

      {!loading && !error ? (
        <>
          {products.length > 0 ? (
            <section className="products-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </section>
          ) : null}

          {blogs.length > 0 ? (
            <section className="section-block">
              <div className="section-head">
                <h3>Helpful guides from search</h3>
              </div>
              <div className="guide-inline-grid">
                {blogs.map((blog) => (
                  <Link key={blog.id} to={`/guides/${blog.slug}`} className="guide-inline-card">
                    <span className="eyebrow-chip">{blog.category?.name || "Guide"}</span>
                    <strong>{blog.title}</strong>
                    <p>{blog.excerpt}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <WebsiteBuyerLeadSection />
        </>
      ) : null}
    </main>
  );
}
