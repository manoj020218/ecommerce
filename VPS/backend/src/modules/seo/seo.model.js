const PRODUCT_CONDITION = "new";

function normalizeBaseUrl(rawValue, fallbackValue) {
  const value = String(rawValue || "").trim();
  const fallback = String(fallbackValue || "").trim();

  if (!value) {
    return fallback.replace(/\/$/, "");
  }
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/$/, "");
  }
  return `https://${value.replace(/\/$/, "")}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function collapseText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatInrAmount(value) {
  return `${Number(value || 0).toFixed(2)} INR`;
}

function formatWeightKg(value) {
  const normalized = Number(value || 0).toFixed(3).replace(/\.?0+$/, "");
  return `${normalized || "0"} kg`;
}

function mapFeedAvailability(product) {
  if (String(product.stockStatus || "").toLowerCase() === "backorder") {
    return "backorder";
  }
  if (String(product.stockStatus || "").toLowerCase() === "out_of_stock") {
    return "out of stock";
  }
  if (Boolean(product.allowBackorder)) {
    return "backorder";
  }
  return Number(product.stockQty || 0) - Number(product.reservedQty || 0) > 0
    ? "in stock"
    : "out of stock";
}

function mapSchemaAvailability(product) {
  const feedValue = mapFeedAvailability(product);
  if (feedValue === "backorder") {
    return "https://schema.org/BackOrder";
  }
  if (feedValue === "in stock") {
    return "https://schema.org/InStock";
  }
  return "https://schema.org/OutOfStock";
}

function buildCategoryPathNames(categoriesById, categoryId) {
  const names = [];
  let currentId = categoryId || null;
  const seen = new Set();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const category = categoriesById.get(currentId);
    if (!category) {
      break;
    }
    names.unshift(category.name);
    currentId = category.parentCategoryId || null;
  }

  return names;
}

function buildSitemapIndexXml(entries) {
  const rows = entries
    .map(
      (entry) =>
        `  <sitemap>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n  </sitemap>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</sitemapindex>`;
}

function buildUrlSetXml(entries) {
  const rows = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>`;
}

module.exports = {
  PRODUCT_CONDITION,
  normalizeBaseUrl,
  escapeXml,
  collapseText,
  formatInrAmount,
  formatWeightKg,
  mapFeedAvailability,
  mapSchemaAvailability,
  buildCategoryPathNames,
  buildSitemapIndexXml,
  buildUrlSetXml
};
