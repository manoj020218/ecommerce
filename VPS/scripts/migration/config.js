/**
 * Selectors for jenixindia.com.
 * Run `node run.js --mode discover --limit 1` first, review console output,
 * then update these selectors to match what the site actually renders.
 */

export const SITE_URL = process.env.SITE_URL || "https://jenixindia.com";
export const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1500);
export const CONCURRENCY = Number(process.env.CONCURRENCY || 2);
export const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";
export const IMAGE_DIR = process.env.IMAGE_DIR || "./output/images";
export const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);

// Pages the crawler must NEVER visit
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

// --- Product page detection ---
// URLs matching these patterns are treated as product pages
export const PRODUCT_URL_PATTERNS = [
  /\/product\//i,
  /\/products\//i,
  /\/p\//i,
  /\/item\//i,
];

// --- Sitemap paths to check ---
export const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-products.xml",
  "/product-sitemap.xml",
  "/sitemap/products.xml",
];

// --- Category / listing page paths to discover product URLs ---
export const CATEGORY_SEED_PATHS = [
  "/",
  "/products",
  "/all-products",
  "/shop",
  "/store",
  "/catalog",
  "/categories",
];

// --- CSS selectors (try in order, first non-empty result wins) ---

export const SELECTORS = {
  // Product title — commmerce.com builder uses h2 (h1 is the newsletter banner)
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

  // Price (sale / current price) — commmerce.com puts both prices in one container;
  // handled by parseCommmercePrice() in crawler.js for this site
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

  // MRP / original price — extracted alongside price in parseCommmercePrice()
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

  // Short description
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

  // Full / long description
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

  // Product images — commmerce.com uses side-img-N classes for gallery
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

  // Main/hero product image (fallback single image)
  mainImage: [
    "img[class*='side-img']",
    ".product-image-main img",
    "[id*='product-image'] img",
    ".featured-image img",
    "img.product-image",
    "img[itemprop='image']",
    ".product img:first-of-type",
  ],

  // Category breadcrumb
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

  // Product listing page - links to individual products
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

  // Pagination next button
  nextPage: [
    "a[rel='next']",
    ".pagination .next",
    ".next-page a",
    "[class*='pagination'] a[class*='next']",
    "a[aria-label='Next page']",
    "a[aria-label='Next']",
  ],
};

// Image size targets (px - width, Sharp will maintain aspect ratio)
export const IMAGE_SIZES = {
  thumbnail: 300,
  medium: 800,
  large: 1200,
};
