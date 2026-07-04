const { env } = require("../../config/env");
const { readCatalogStore } = require("../../database/catalog-store");
const { getAllSettings } = require("../settings/settings.service");
const { normalizeBaseUrl, escapeXml } = require("../seo/seo.model");
const {
  buildProductFeedFields,
  buildMerchantItemXml
} = require("./google-merchant.model");

async function generateGoogleMerchantFeedXml() {
  const [catalogStore, settings] = await Promise.all([readCatalogStore(), getAllSettings()]);
  const baseUrl = normalizeBaseUrl(settings.seoDefaults.canonicalDomain, env.publicBaseUrl);
  const categoriesById = new Map(
    catalogStore.categories.map((category) => [category.id, category])
  );

  const items = catalogStore.products
    .filter((product) => product.isActive)
    .map((product) =>
      buildMerchantItemXml(
        buildProductFeedFields(product, {
          baseUrl,
          apiBaseUrl: env.publicBaseUrl,
          categoriesById,
          storeName: settings.storeProfile.storeName || "Jenix India",
          defaultOgImageUrl: settings.seoDefaults.defaultOgImageUrl || ""
        })
      )
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n  <title>${escapeXml(settings.storeProfile.storeName || "Jenix India")}</title>\n  <link>${escapeXml(baseUrl)}</link>\n  <description>${escapeXml("Google Merchant feed for Jenix Commerce products.")}</description>\n${items}\n</channel>\n</rss>`;
}

module.exports = {
  generateGoogleMerchantFeedXml
};
