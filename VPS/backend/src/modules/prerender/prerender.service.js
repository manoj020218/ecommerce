const fs = require("fs/promises");
const path = require("path");
const { env } = require("../../config/env");
const { HttpError } = require("../../common/http-error");
const { escapeXml } = require("../seo/seo.model");
const { sanitizeRichText } = require("../../common/html-sanitizer");
const { getPublicProductPage } = require("../products/products.service");

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
  const blocks = [structuredData.product, structuredData.offer, structuredData.breadcrumb]
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

function injectBody(html, product, breadcrumb, seo) {
  const skeleton = buildVisibleSkeleton(product, breadcrumb, seo);
  return html.replace(
    '<div id="root"></div>',
    `<div id="root">\n    ${skeleton}\n  </div>`
  );
}

function build404Html(baseHtml) {
  return baseHtml
    .replace(/<title>[^<]*<\/title>/, "<title>Product not found — Jenix India</title>")
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
      return { status: 404, html: build404Html(baseHtml) };
    }
    throw error;
  }

  const { product, breadcrumb, seo, structuredData } = page;

  let html = injectHeadTags(baseHtml, seo);
  html = injectJsonLd(html, structuredData);
  html = injectBody(html, product, breadcrumb, seo);

  return { status: 200, html };
}

module.exports = { renderProductPageHtml };
