const fs = require("fs/promises");
const path = require("path");
const { env } = require("../../config/env");
const { HttpError } = require("../../common/http-error");
const { escapeXml } = require("../seo/seo.model");
const { buildCategoryPageSeoPayload } = require("../seo/seo.service");
const { sanitizeRichText } = require("../../common/html-sanitizer");
const { getPublicProductPage } = require("../products/products.service");
const { getPublicCategoryPage } = require("../categories/categories.service");
const { getPublicBlogBySlug } = require("../blogs/blogs.service");

// Product pages: EVERY visitor (bot and human) is routed here now, not just
// crawlers — see nginx's /products/:slug location. Category/guide pages
// still route bots-only through $is_crawler; product pages were singled out
// first because that's the page real visitors actually complained about
// ("feels slow coming from Google search"). nginx falls back to the plain
// SPA shell (error_page 502/503/504 -> @spa_fallback) if this endpoint or
// the backend itself is unavailable, so a bug here degrades to today's
// behavior instead of breaking the page outright.

function resolveDistIndexPath() {
  return path.resolve(process.cwd(), env.frontDistIndexPath);
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function injectHeadTags(html, seo) {
  let out = html;

  out = replaceTag(out, /<title>[^<]*<\/title>/, `<title>${escapeXml(seo.metaTitle)}</title>`);
  out = replaceTag(
    out,
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeXml(seo.metaDescription)}" />`
  );
  out = replaceTag(
    out,
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeXml(seo.metaTitle)}" />`
  );
  out = replaceTag(
    out,
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeXml(seo.metaDescription)}" />`
  );
  out = replaceTag(
    out,
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeXml(seo.canonicalUrl)}" />`
  );
  out = replaceTag(
    out,
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeXml(seo.metaTitle)}" />`
  );
  out = replaceTag(
    out,
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${escapeXml(seo.metaDescription)}" />`
  );
  out = replaceTag(
    out,
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeXml(seo.canonicalUrl)}" />`
  );

  if (seo.ogImageUrl) {
    if (/<meta property="og:image" content="[^"]*"\s*\/?>/.test(out)) {
      out = out.replace(
        /<meta property="og:image" content="[^"]*"\s*\/?>/,
        `<meta property="og:image" content="${escapeXml(seo.ogImageUrl)}" />`
      );
    } else {
      out = out.replace(
        /<meta property="og:url"[^>]*>/,
        (match) => `${match}\n    <meta property="og:image" content="${escapeXml(seo.ogImageUrl)}" />`
      );
    }
  }

  return out;
}

function injectJsonLd(html, structuredData) {
  // Generic over whatever keys the caller's structuredData object has
  // (product/offer/breadcrumb for products, collection/breadcrumb for
  // categories) — no per-resource-type branching needed here.
  const blocks = Object.values(structuredData)
    .filter(Boolean)
    // A stray "</script>" inside a string field (e.g. a product description)
    // would otherwise break out of the script tag — escape "<" so JSON.parse
    // still works fine client-side but the raw HTML can't be split early.
    .map((obj) => `    <script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`)
    .join("\n");

  return html.replace("</head>", `${blocks}\n  </head>`);
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

// Crawlers only ever read this markup (no JS execution). Real visitors now
// see it too, but only for a moment: it uses the same CSS classes as the
// real product-page.jsx layout (so it's already styled/positioned
// correctly, not a plain-text flash) and is replaced by the full
// interactive React page the instant the JS bundle finishes loading and
// boots — see injectInitialData below for how that handoff avoids a second
// "loading" flash on top of this one.
function buildVisibleSkeleton(product, breadcrumb, seo) {
  const price = Number(product.pricing?.visiblePrice || 0);
  const compareAtPrice = Number(product.pricing?.compareAtPrice || 0);
  const crumbLinks = breadcrumb
    .map((item) => `<a href="${escapeXml(item.href)}">${escapeXml(item.label)}</a>`)
    .join(" &raquo; ");

  // Re-sanitized here (not just trusted from storage) — the validator's
  // richTextSchema sanitizes on every write via the admin panel, but the
  // original bulk-migration import wrote directly to the JSON store and may
  // predate that pipeline, so this endpoint can't assume every stored
  // shortDescription is safe to embed as raw HTML.
  const safeShortDescription = sanitizeRichText(product.shortDescription || "");
  const reviewCount = Number(product.reviewCount || 0);
  const heroImage = Array.isArray(product.images) && product.images[0]
    ? escapeXml(product.images[0].url || product.images[0].thumbnail || "")
    : "";

  return `
    <nav class="proto-breadcrumb">${crumbLinks}</nav>
    <main class="proto-main-shell proto-product-page">
      <section class="proto-product-layout">
        <div class="proto-product-gallery">
          <div class="proto-product-main-image">
            ${heroImage ? `<img src="${heroImage}" alt="${escapeXml(product.title)}" fetchpriority="high" />` : ""}
          </div>
        </div>
        <div class="proto-product-summary">
          <h1>${escapeXml(product.title)}</h1>
          <p class="proto-product-subtitle">SKU: ${escapeXml(product.sku || "--")}</p>
          <div class="proto-price-row proto-price-row-large">
            <strong>${escapeXml(inrFormatter.format(price))}</strong>
            ${compareAtPrice > price ? `<span>${escapeXml(inrFormatter.format(compareAtPrice))}</span>` : ""}
          </div>
          ${reviewCount > 0 ? `<p>Rating: ${escapeXml(Number(product.avgRating || 0).toFixed(1))}/5 (${reviewCount} review${reviewCount === 1 ? "" : "s"})</p>` : ""}
          ${safeShortDescription ? `<div>${safeShortDescription}</div>` : ""}
        </div>
      </section>
    </main>`;
}

function injectBody(html, skeletonHtml) {
  return html.replace(
    '<div id="root"></div>',
    `<div id="root">\n    ${skeletonHtml}\n  </div>`
  );
}

// Embeds the exact same product payload the client would otherwise fetch
// from GET /api/products/:slug, so product-page.jsx's first render can use
// it immediately instead of showing its own loading skeleton and firing a
// redundant request. product-page.jsx still revalidates in the background
// (covers price/stock changing between this response and the JS finishing
// load) — this only removes the *visible wait*, not the fetch itself.
function injectInitialData(html, product) {
  const json = JSON.stringify(product).replace(/</g, "\\u003c");
  return html.replace(
    "</body>",
    `    <script>window.__INITIAL_PRODUCT__ = ${json};</script>\n  </body>`
  );
}

// Same "real users never see this" reasoning as buildVisibleSkeleton above.
function buildCategorySkeleton(category, breadcrumb, products) {
  const crumbLinks = breadcrumb
    .map((item) => `<a href="${escapeXml(item.href)}">${escapeXml(item.label)}</a>`)
    .join(" &raquo; ");
  const safeDescription = sanitizeRichText(category.description || "");
  const productLinks = products
    .map(
      (product) =>
        `<li><a href="/products/${escapeXml(product.slug)}">${escapeXml(product.title)}</a></li>`
    )
    .join("\n      ");

  return [
    `<nav>${crumbLinks}</nav>`,
    `<h1>${escapeXml(category.name)}</h1>`,
    safeDescription ? `<div>${safeDescription}</div>` : "",
    productLinks ? `<ul>\n      ${productLinks}\n    </ul>` : ""
  ]
    .filter(Boolean)
    .join("\n    ");
}

// Same "real users never see this" reasoning as the other skeleton builders.
function buildBlogSkeleton(article) {
  const safeContent = sanitizeRichText(article.content || "");

  return [
    `<nav><a href="/">Home</a> &raquo; <a href="/guides">Guides</a> &raquo; ${escapeXml(article.title)}</nav>`,
    `<h1>${escapeXml(article.title)}</h1>`,
    article.excerpt ? `<p>${escapeXml(article.excerpt)}</p>` : "",
    safeContent ? `<div>${safeContent}</div>` : ""
  ]
    .filter(Boolean)
    .join("\n    ");
}

function build404Html(baseHtml, label) {
  return baseHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(label)} not found — Jenix India</title>`)
    .replace(
      /<meta name="robots" content="[^"]*"\s*\/?>/,
      '<meta name="robots" content="noindex, follow" />'
    );
}

async function renderProductPageHtml(slug) {
  const baseHtml = await fs.readFile(resolveDistIndexPath(), "utf-8");

  let page;
  try {
    page = await getPublicProductPage(slug, {});
  } catch (error) {
    // Only a genuine "no such product" becomes a 404 shell here — any other
    // error (a real bug, a store read failure) must still propagate so it
    // shows up in logs/error handling like everywhere else, instead of
    // silently masquerading as a 404.
    if (error instanceof HttpError && error.statusCode === 404) {
      return { status: 404, html: build404Html(baseHtml, "Product") };
    }
    throw error;
  }

  const { product, breadcrumb, seo, structuredData } = page;

  let html = injectHeadTags(baseHtml, seo);
  html = injectJsonLd(html, structuredData);
  html = injectBody(html, buildVisibleSkeleton(product, breadcrumb, seo));
  html = injectInitialData(html, product);

  return { status: 200, html };
}

async function renderCategoryPageHtml(slug) {
  const baseHtml = await fs.readFile(resolveDistIndexPath(), "utf-8");

  let page;
  try {
    page = await getPublicCategoryPage(slug);
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return { status: 404, html: build404Html(baseHtml, "Category") };
    }
    throw error;
  }

  const { category, breadcrumb, products } = page;
  const { seo, structuredData } = await buildCategoryPageSeoPayload(category, products, breadcrumb);

  let html = injectHeadTags(baseHtml, seo);
  html = injectJsonLd(html, structuredData);
  html = injectBody(html, buildCategorySkeleton(category, breadcrumb, products));

  return { status: 200, html };
}

async function renderBlogPageHtml(slug) {
  const baseHtml = await fs.readFile(resolveDistIndexPath(), "utf-8");

  let page;
  try {
    page = await getPublicBlogBySlug(slug);
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return { status: 404, html: build404Html(baseHtml, "Guide") };
    }
    throw error;
  }

  const { article, structuredData } = page;
  const seo = {
    metaTitle: article.seoTitle,
    metaDescription: article.seoDescription,
    canonicalUrl: article.canonicalUrl,
    ogImageUrl: article.ogImageUrl
  };

  let html = injectHeadTags(baseHtml, seo);
  html = injectJsonLd(html, structuredData);
  html = injectBody(html, buildBlogSkeleton(article));

  return { status: 200, html };
}

module.exports = { renderProductPageHtml, renderCategoryPageHtml, renderBlogPageHtml };
