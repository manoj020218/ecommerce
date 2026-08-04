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

// Only known crawler/link-preview user agents ever reach this route (nginx
// routes them here, everyone else keeps getting the plain SPA build) — see
// the `map $http_user_agent $is_crawler` block in the nginx config. This
// module stays dumb on purpose: no UA re-check here, single source of truth.

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

// Real users never see this — the SPA does a fresh createRoot().render() on
// mount (no hydration), which fully replaces #root's contents. This exists
// purely so a non-JS-executing crawler sees real text instead of an empty
// div, which also helps the "content looks empty" side of the soft-404
// problem, not just the meta-tag side.
function buildVisibleSkeleton(product, breadcrumb, seo) {
  const price = Number(product.pricing?.visiblePrice || 0).toFixed(2);
  const crumbLinks = breadcrumb
    .map((item) => `<a href="${escapeXml(item.href)}">${escapeXml(item.label)}</a>`)
    .join(" &raquo; ");

  // Re-sanitized here (not just trusted from storage) — the validator's
  // richTextSchema sanitizes on every write via the admin panel, but the
  // original bulk-migration import wrote directly to the JSON store and may
  // predate that pipeline, so this endpoint can't assume every stored
  // shortDescription is safe to embed as raw HTML.
  const safeShortDescription = sanitizeRichText(product.shortDescription || "");

  return [
    `<nav>${crumbLinks}</nav>`,
    `<h1>${escapeXml(product.title)}</h1>`,
    safeShortDescription ? `<div>${safeShortDescription}</div>` : "",
    `<p>Price: &#8377;${escapeXml(price)}</p>`,
    `<p>SKU: ${escapeXml(product.sku || "")}</p>`
  ]
    .filter(Boolean)
    .join("\n    ");
}

function injectBody(html, skeletonHtml) {
  return html.replace(
    '<div id="root"></div>',
    `<div id="root">\n    ${skeletonHtml}\n  </div>`
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
