/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          commmerce-site-crawler  —  config.js               ║
 * ║                                                              ║
 * ║  THIS IS THE ONLY FILE YOU NEED TO EDIT.                    ║
 * ║                                                              ║
 * ║  1. Copy .env.example → .env and set SITE_URL.              ║
 * ║  2. Run: node run.js --mode discover --limit 1              ║
 * ║     Review the console output to verify selectors match.    ║
 * ║  3. Adjust selectors below if anything is wrong, then       ║
 * ║     run: node run.js --mode all                             ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * commmerce.com stores all use the same React SSR builder, so the
 * default selectors below work for every store on the platform.
 * Only tweak them if a particular store has customised its theme.
 */

// ── Site settings (override via .env) ─────────────────────────────────────────

export const SITE_URL = process.env.SITE_URL || "";
export const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1500);
export const CONCURRENCY = Number(process.env.CONCURRENCY || 2);
export const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";
export const IMAGE_DIR = process.env.IMAGE_DIR || "./output/images";
export const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);

if (!SITE_URL) {
  console.error("[config] ERROR: SITE_URL is not set. Copy .env.example → .env and set SITE_URL.");
  process.exit(1);
}

// ── Paths the crawler must NEVER visit ────────────────────────────────────────
export const BLOCKED_PATH_PATTERNS = [
  /\/cart/i,
  /\/checkout/i,
  /\/account/i,
  /\/login/i,
  /\/register/i,
  /\/my-orders/i,
  /\/admin/i,
  /\/wp-admin/i,
  /\/dashboard/i,
];

// ── Product URL detection ──────────────────────────────────────────────────────
// URLs matching any of these are treated as individual product pages.
export const PRODUCT_URL_PATTERNS = [
  /\/product\//i,
  /\/products\//i,
  /\/p\//i,
  /\/item\//i,
];

// ── Sitemap paths to try ───────────────────────────────────────────────────────
export const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-products.xml",
  "/product-sitemap.xml",
  "/sitemap/products.xml",
];

// ── Category / listing seed pages ─────────────────────────────────────────────
// The crawler starts here, follows product links and pagination automatically.
export const CATEGORY_SEED_PATHS = [
  "/",
  "/products",
  "/all-products",
  "/shop",
  "/store",
  "/catalog",
  "/categories",
];

// ── CSS selectors ──────────────────────────────────────────────────────────────
// Each array is tried in order; the first selector that returns non-empty text wins.
// commmerce.com-specific selectors are listed first; generic fallbacks follow.

export const SELECTORS = {
  // Product title
  // NOTE: commmerce.com puts the newsletter tagline in h1 and the actual
  // product title in h2.product-details-heading — that's why h2 comes first.
  title: [
    "h2.product-details-heading",
    "h2#productHead",
    "h1.product-title",
    "h1.product_title",
    "h1[itemprop='name']",
    ".product-name h1",
    ".product-detail h1",
    "h1.title",
    "h1",
  ],

  // Sale / current price
  // commmerce.com packs both prices into one container; the crawler's
  // parseCommmercePrice() handles that automatically when this selector hits.
  price: [
    ".productDetails .product-price-container",
    "[itemprop='price']",
    ".product-price .price",
    ".sale-price",
    ".current-price",
    ".price-value",
    ".product-price",
    ".price ins",
    ".price",
  ],

  // MRP / original / compare-at price
  mrp: [
    ".compare-at-price",
    ".original-price",
    ".regular-price",
    ".old-price",
    "span.strike-price",
    ".price del",
    "del .price",
    "s.price",
    "[class*='mrp']",
    "[class*='original']",
    "[class*='compare']",
  ],

  // Short description (shown below title)
  shortDescription: [
    ".product-details-desc",
    "[itemprop='description']",
    ".product-short-description",
    ".product-description-short",
    ".product-summary",
    ".product-excerpt",
    ".short-description",
    "[class*='short-desc']",
  ],

  // Full / long description (tab content etc.)
  fullDescription: [
    ".product-details-desc",
    "#description",
    ".product-description",
    ".description",
    "[class*='full-desc']",
    "[class*='product-detail']",
    ".tab-content #description",
    ".woocommerce-product-details__short-description",
  ],

  // Specifications table or list
  specifications: [
    "#specifications",
    ".specifications",
    ".product-specifications",
    ".specs",
    "[class*='spec']",
    ".tab-content #specifications",
    "table.specs",
  ],

  // Product images (gallery)
  // commmerce.com gallery images use side-img-0, side-img-1 … class names.
  images: [
    "img[class*='side-img']",
    ".product-img-col img",
    ".productSliderWrap img",
    ".product-images img",
    ".product-gallery img",
    ".product-image img",
    "[class*='gallery'] img",
    "[id*='gallery'] img",
    ".slick-slide img",
    ".owl-item img",
    ".product img",
  ],

  // Hero / main image (fallback when no gallery found)
  mainImage: [
    "img[class*='side-img']",
    ".product-image-main img",
    "[id*='product-image'] img",
    ".featured-image img",
    "img.product-image",
    "img[itemprop='image']",
    ".product img:first-of-type",
  ],

  // Breadcrumb → category name
  category: [
    "[itemprop='breadcrumb'] li:nth-last-child(2)",
    ".breadcrumb li:nth-last-child(2)",
    ".breadcrumbs li:nth-last-child(2)",
    "nav.breadcrumb li:nth-last-child(2)",
    "[class*='breadcrumb'] a:last-of-type",
  ],

  // SEO meta
  seoTitle: ["title", "meta[property='og:title']"],
  seoDescription: [
    "meta[name='description']",
    "meta[property='og:description']",
  ],

  // Links to individual products on listing/category pages
  productLinks: [
    "a.product-link",
    ".product-list a",
    ".products-grid a",
    ".product-card a",
    ".product-item a",
    "[class*='product-list'] a",
    "[class*='product-grid'] a",
    "a[href*='/product']",
    "a[href*='/products/']",
    "a[href*='/p/']",
  ],

  // Pagination — "next" link
  nextPage: [
    "a[rel='next']",
    ".pagination .next",
    ".next-page a",
    "[class*='pagination'] a[class*='next']",
    "a[aria-label='Next page']",
    "a[aria-label='Next']",
  ],
};

// ── Image output sizes (width in px; Sharp maintains aspect ratio) ─────────────
export const IMAGE_SIZES = {
  thumbnail: 300,
  medium: 800,
  large: 1200,
};
