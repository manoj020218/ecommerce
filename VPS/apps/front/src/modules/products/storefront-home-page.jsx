import { useEffect, useMemo, useRef, useState } from "react";
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
  listBestSellers,
  listCategories,
  listProducts
} from "./products.api";
import { usePublicSettings } from "../settings/public-settings-context";
import { ProductSkeletonGrid } from "../../shared/products/product-skeleton";

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
  const outOfStock = product.isPurchasable === false;

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
        {outOfStock ? (
          <span className="proto-product-flag proto-flag-red">Out of Stock</span>
        ) : label ? (
          <span className={badgeClass(product.productLabel || "")}>
            {label}
          </span>
        ) : null}
      </div>
      <div className="proto-product-copy">
        {metaLine ? <p>{metaLine}</p> : null}
        <h3>{product.title}</h3>
        {outOfStock ? (
          <p className="proto-tax-line" style={{ color: "#b91c1c", fontWeight: 600 }}>
            Currently out of stock
          </p>
        ) : (
          <>
            <div className="proto-price-row">
              <strong>{currency(price)}</strong>
              {comparePrice && comparePrice > price ? <span>{currency(comparePrice)}</span> : null}
            </div>
            <small>
              {product.priceIncludesGst ? "GST included" : `+${Number(product.gstRate || 18)}% GST`}
            </small>
          </>
        )}
        <StorefrontButton
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onAddToCart(product);
          }}
          disabled={busy || outOfStock}
        >
          {outOfStock ? "Out of Stock" : busy ? "Adding..." : "Add to Cart"}
        </StorefrontButton>
      </div>
    </Link>
  );
}

// Renders immediately with a skeleton and only fetches its own products once
// it scrolls near the viewport — so the 13-ish category rails on a typical
// storefront don't all fire their API calls in one burst the moment the page
// loads, and the visitor sees new rails keep arriving as they scroll instead
// of a single big wait.
const CATEGORY_RAIL_LIMIT = 5;

function CategoryRailSection({ category, index, categories, busyProductId, onAddToCart }) {
  const [items, setItems] = useState(null); // null = not fetched yet
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || items !== null) return undefined;
    let active = true;
    listProducts({ categoryId: category.id, limit: CATEGORY_RAIL_LIMIT, availability: "in_stock" })
      .then((res) => {
        if (active) setItems(res?.items ?? []);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, [visible, items, category.id]);

  if (items !== null && items.length === 0) {
    return null;
  }

  return (
    <section
      ref={sectionRef}
      className={`proto-section${index % 2 === 0 ? " proto-section-surface" : ""}`}
    >
      <StorefrontSectionHeader
        title={category.name}
        action={<Link to={`/categories/${category.slug}`}>View all →</Link>}
      />
      <div className="proto-product-scroller">
        {items === null ? (
          <ProductSkeletonGrid count={CATEGORY_RAIL_LIMIT} variant="rail" />
        ) : (
          items.map((product) => (
            <ProductRailCard
              key={product.id}
              product={product}
              categories={categories}
              busy={busyProductId === product.id}
              onAddToCart={onAddToCart}
            />
          ))
        )}
      </div>
    </section>
  );
}

function NewArrivalCard({ product, busy, onAddToCart }) {
  const price = visiblePrice(product);
  const outOfStock = product.isPurchasable === false;

  return (
    <Link to={`/products/${product.slug}`} className="proto-arrival-card">
      <div className="proto-arrival-media">
        {Array.isArray(product.images) && product.images[0] ? (
          <img src={resolveImg(product.images[0])} alt={product.title} loading="lazy" />
        ) : (
          <div className="proto-product-placeholder">{product.brand || "Jenix"}</div>
        )}
        {outOfStock ? (
          <span className="proto-product-flag proto-flag-red">Out of Stock</span>
        ) : null}
      </div>
      <div className="proto-arrival-copy">
        <p className="proto-arrival-brand">{product.brand || "Jenix"}</p>
        <h3>{product.title}</h3>
        <div className="proto-arrival-footer">
          <div>
            {outOfStock ? (
              <span style={{ color: "#b91c1c", fontWeight: 600, fontSize: 12 }}>Out of stock</span>
            ) : (
              <>
                <strong>{currency(price)}</strong>
                <small>
                  {product.priceIncludesGst ? "GST included" : `+${Number(product.gstRate || 18)}% GST`}
                </small>
              </>
            )}
          </div>
          <button
            type="button"
            className="proto-arrival-add"
            onClick={(event) => {
              event.preventDefault();
              onAddToCart(product);
            }}
            disabled={busy || outOfStock}
            aria-label={outOfStock ? "Out of stock" : "Add to cart"}
          >
            {outOfStock ? (
              <span style={{ fontSize: 10, fontWeight: 700 }}>N/A</span>
            ) : busy ? (
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

function MarqueeCategoryCard({ category }) {
  return (
    <Link to={`/categories/${category.slug}`} className="proto-cat-card">
      <div className="proto-cat-img">
        {category.imageUrl ? (
          <img src={category.imageUrl} alt={category.name} loading="lazy" />
        ) : (
          <svg className="proto-cat-fallback-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        )}
      </div>
      <span className="proto-cat-name">{category.name}</span>
    </Link>
  );
}

function SecurityCameraIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="proto-device-icon-svg">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
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

function HeroBannerSlider({ slides }) {
  const [active, setActive] = useState(0);
  const timerRef = useRef(null);
  const total = slides.length;

  function startTimer() {
    timerRef.current = setInterval(() => setActive((a) => (a + 1) % total), 5000);
  }

  useEffect(() => {
    if (total <= 1) return undefined;
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [total]);

  function goTo(idx) {
    setActive((idx + total) % total);
  }

  return (
    <section
      className="proto-banner-slider"
      onMouseEnter={() => clearInterval(timerRef.current)}
      onMouseLeave={() => { if (total > 1) startTimer(); }}
    >
      <div className="proto-banner-track" style={{ transform: `translateX(-${active * 100}%)` }}>
        {slides.map((slide, idx) => (
          <div key={slide.id || idx} className="proto-banner-slide">
            <picture>
              {slide.mobileImageUrl ? (
                <source media="(max-width: 639px)" srcSet={slide.mobileImageUrl} />
              ) : null}
              <img
                src={slide.desktopImageUrl || slide.mobileImageUrl || ""}
                alt={slide.title || `Banner ${idx + 1}`}
                loading={idx === 0 ? "eager" : "lazy"}
              />
            </picture>
            {(slide.title || slide.linkUrl) ? (
              <div className="proto-banner-overlay">
                {slide.title ? <h2>{slide.title}</h2> : null}
                {slide.subtitle ? <p>{slide.subtitle}</p> : null}
                {slide.linkUrl ? (
                  <Link to={slide.linkUrl} className="proto-banner-cta">
                    {slide.linkLabel || "Shop Now"}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {total > 1 ? (
        <>
          <button className="proto-banner-arrow proto-banner-prev" aria-label="Previous" onClick={() => goTo(active - 1)}>‹</button>
          <button className="proto-banner-arrow proto-banner-next" aria-label="Next" onClick={() => goTo(active + 1)}>›</button>
          <div className="proto-banner-dots">
            {slides.map((_, idx) => (
              <button
                key={idx}
                aria-label={`Go to slide ${idx + 1}`}
                className={`proto-banner-dot${idx === active ? " active" : ""}`}
                onClick={() => goTo(idx)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function StorefrontHomePage() {
  const { settings: publicSettings } = usePublicSettings();
  const { isAuthenticated } = useCustomerSession();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);           // first 8 in-stock — new-arrivals fallback source
  const [bestSellers, setBestSellers] = useState([]);      // ranked by actual units sold
  const [latestProducts, setLatestProducts] = useState([]); // next 8 — new arrivals rail
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newArrivalsLoading, setNewArrivalsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyProductId, setBusyProductId] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHome() {
      try {
        setLoading(true);
        setNewArrivalsLoading(true);
        setError("");

        // Phase 1: categories + first 8 in-stock products + blogs + bestsellers in parallel
        const [categoryRows, firstBatch, blogRows, bestSellerRows] = await Promise.all([
          listCategories(),
          listProducts({ limit: 8, offset: 0, availability: "in_stock" }),
          listBlogs({ limit: 6 }),
          listBestSellers(8).catch(() => [])
        ]);

        if (!active) return;

        const categoryList = Array.isArray(categoryRows) ? categoryRows : [];
        setCategories(categoryList);
        setBlogs(Array.isArray(blogRows) ? blogRows : []);
        setBestSellers(Array.isArray(bestSellerRows) ? bestSellerRows : []);

        const firstItems = firstBatch?.items ?? (Array.isArray(firstBatch) ? firstBatch : []);
        setProducts(firstItems);
        setLoading(false);

        // Phase 2: next 8 in-stock products for New Arrivals (loads after hero is already visible)
        if (firstBatch?.hasMore) {
          const secondBatch = await listProducts({ limit: 8, offset: 8, availability: "in_stock" });
          if (!active) return;
          const secondItems = secondBatch?.items ?? [];
          setLatestProducts(secondItems.length > 0 ? secondItems : firstItems.slice(0, 8));
        } else {
          setLatestProducts(firstItems.slice(0, 8));
        }
        setNewArrivalsLoading(false);

        // Per-category rails no longer fetched here — each CategoryRailSection
        // fetches its own ~5 products lazily as it scrolls into view (see
        // that component), instead of firing one call per category upfront.
      } catch (requestError) {
        if (active) {
          setError(requestError.message || "Failed to load the storefront.");
          setLoading(false);
          setNewArrivalsLoading(false);
        }
      }
    }

    loadHome();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const seoDefaults = publicSettings.seoDefaults || {};
    const storeProfile = publicSettings.storeProfile || {};
    const storeName = storeProfile.storeName || "Jenix India";
    const homeMetaTitle = seoDefaults.homeMetaTitle
      ? `${seoDefaults.homeMetaTitle} — ${storeName}`
      : `${storeName} — CCTV, Smart Security & IoT Solutions`;
    const metaDescription = seoDefaults.homeMetaDescription ||
      "Jenix India supplies CCTV cameras, smart locks, gate automation, IP networking, fire alarms and access control. GST invoice, same-day dispatch, pan-India delivery.";
    const canonicalRoot = String(seoDefaults.canonicalDomain || "https://jenixindia.com").replace(/\/+$/, "");
    const canonicalUrl = `${canonicalRoot}/`;
    const ogImage = seoDefaults.defaultOgImageUrl || `${canonicalRoot}/og-cover.jpg`;
    const supportPhone = storeProfile.supportMobile || storeProfile.phone || "";
    const storeAddress = storeProfile.address || "";
    const storeCity = storeProfile.city || "";
    const storeState = storeProfile.state || "";

    document.title = homeMetaTitle;

    // Core meta
    upsertMetaTag("description", metaDescription);
    upsertMetaTag("keywords", "CCTV cameras India, security cameras, smart locks, gate automation, IP cameras, access control, fire alarm, IoT devices, NVR DVR, Jenix India");
    upsertMetaTag("robots", "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1");

    // Open Graph
    upsertMetaTag("og:type", "website", "property");
    upsertMetaTag("og:site_name", storeName, "property");
    upsertMetaTag("og:title", homeMetaTitle, "property");
    upsertMetaTag("og:description", metaDescription, "property");
    upsertMetaTag("og:url", canonicalUrl, "property");
    upsertMetaTag("og:locale", "en_IN", "property");
    if (ogImage) upsertMetaTag("og:image", ogImage, "property");

    // Twitter Card
    upsertMetaTag("twitter:card", "summary_large_image");
    upsertMetaTag("twitter:title", homeMetaTitle);
    upsertMetaTag("twitter:description", metaDescription);
    if (ogImage) upsertMetaTag("twitter:image", ogImage);

    // Verification
    if (seoDefaults.searchConsoleVerification) {
      upsertMetaTag("google-site-verification", seoDefaults.searchConsoleVerification);
    }
    if (seoDefaults.bingVerification) {
      upsertMetaTag("msvalidate.01", seoDefaults.bingVerification);
    }

    upsertCanonical(canonicalUrl);

    // JSON-LD structured data
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${canonicalRoot}/#organization`,
          "name": storeName,
          "url": canonicalRoot,
          "logo": ogImage ? { "@type": "ImageObject", "url": ogImage } : undefined,
          "description": metaDescription,
          "contactPoint": supportPhone ? [{
            "@type": "ContactPoint",
            "telephone": supportPhone,
            "contactType": "customer service",
            "availableLanguage": ["English", "Hindi"]
          }] : undefined,
          "address": storeAddress ? {
            "@type": "PostalAddress",
            "streetAddress": storeAddress,
            "addressLocality": storeCity,
            "addressRegion": storeState,
            "addressCountry": "IN"
          } : undefined
        },
        {
          "@type": "WebSite",
          "@id": `${canonicalRoot}/#website`,
          "url": canonicalRoot,
          "name": storeName,
          "publisher": { "@id": `${canonicalRoot}/#organization` },
          "potentialAction": {
            "@type": "SearchAction",
            "target": {
              "@type": "EntryPoint",
              "urlTemplate": `${canonicalRoot}/products?q={search_term_string}`
            },
            "query-input": "required name=search_term_string"
          }
        },
        {
          "@type": ["LocalBusiness", "Store"],
          "@id": `${canonicalRoot}/#localbusiness`,
          "name": storeName,
          "url": canonicalRoot,
          "image": ogImage || undefined,
          "description": metaDescription,
          "priceRange": "₹₹",
          "currenciesAccepted": "INR",
          "paymentAccepted": "Cash, Credit Card, UPI, Bank Transfer",
          "areaServed": { "@type": "Country", "name": "India" },
          "telephone": supportPhone || undefined,
          "address": storeAddress ? {
            "@type": "PostalAddress",
            "streetAddress": storeAddress,
            "addressLocality": storeCity,
            "addressRegion": storeState,
            "addressCountry": "IN"
          } : undefined,
          "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Security & IoT Products",
            "itemListElement": [
              { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "CCTV Cameras" } },
              { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "Smart Locks" } },
              { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "Gate Automation" } },
              { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "IP Cameras" } },
              { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "Access Control Systems" } },
              { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "Fire Alarm Systems" } }
            ]
          }
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": canonicalUrl }]
        }
      ].filter(Boolean)
    };

    let ldScript = document.head.querySelector('script[data-jenix-ld="home"]');
    if (!ldScript) {
      ldScript = document.createElement("script");
      ldScript.type = "application/ld+json";
      ldScript.setAttribute("data-jenix-ld", "home");
      document.head.append(ldScript);
    }
    ldScript.textContent = JSON.stringify(jsonLd, null, 0);
  }, [publicSettings]);

  const featuredProduct = products[0] || null;
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

  const bannerSlides = publicSettings.heroBanners?.slides || [];

  return (
    <main className="proto-main-shell proto-main-shell-home">
      {bannerSlides.length > 0 ? (
        <HeroBannerSlider slides={bannerSlides} />
      ) : (
      <section className="proto-home-hero">
        <div className="proto-home-hero-copy">
          <span className="proto-home-kicker">Premium Security Systems</span>
          {(() => {
            const words = heroTitle.trim().split(/\s+/);
            if (words.length <= 1) return <h1>{heroTitle}</h1>;
            const accent = words[words.length - 1];
            const rest = words.slice(0, -1).join(" ");
            return <h1>{rest} <span className="proto-hero-accent">{accent}</span></h1>;
          })()}
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
          <div className="proto-home-feature-card proto-home-feature-device">
            <div className="proto-device-ring-outer">
              <div className="proto-device-ring-inner">
                <SecurityCameraIcon />
              </div>
            </div>
            <div className="proto-device-card-text">
              <strong>{featuredProduct?.title || "AI Face Recognition Terminal"}</strong>
              <p>{featuredProduct ? currency(visiblePrice(featuredProduct)) : "Ready to Ship"}</p>
              {supportPhone ? <span className="proto-device-phone">{supportPhone}</span> : null}
            </div>
          </div>
        </div>

        <div className="proto-hero-dots">
          <span className="proto-hero-dot active" />
          <span className="proto-hero-dot" />
          <span className="proto-hero-dot" />
        </div>
      </section>
      )}

      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}
      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}

      <section className="proto-section proto-category-marquee-section">
        <StorefrontSectionHeader
          title="Shop by Category"
          action={<Link to="/products">View all →</Link>}
        />
        {loading ? (
          <StorefrontLoadingState label="Loading categories..." />
        ) : categories.length > 0 ? (
          <div className="proto-category-marquee">
            <div className="proto-category-track">
              {[...categories, ...categories, ...categories].map((category, index) => (
                <MarqueeCategoryCard key={`${category.id}-${index}`} category={category} />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {loading || bestSellers.length > 0 ? (
        <section className="proto-section proto-section-surface">
          <StorefrontSectionHeader
            title="Bestsellers"
            action={<Link to="/products">View all →</Link>}
          />
          {loading ? (
            <StorefrontLoadingState label="Loading products..." />
          ) : (
            <div className="proto-product-scroller">
              {bestSellers.map((product) => (
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
      ) : null}

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
        <div className="proto-product-grid">
          {latestProducts.map((product) => (
            <NewArrivalCard
              key={product.id}
              product={product}
              busy={busyProductId === product.id}
              onAddToCart={addProductToCart}
            />
          ))}
          {newArrivalsLoading ? <ProductSkeletonGrid count={8} /> : null}
        </div>
      </section>

      {categories.map((category, index) => (
        <CategoryRailSection
          key={category.id}
          category={category}
          index={index}
          categories={categories}
          busyProductId={busyProductId}
          onAddToCart={addProductToCart}
        />
      ))}

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
