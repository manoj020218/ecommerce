const { env } = require("../../config/env");
const { readCatalogStore } = require("../../database/catalog-store");
const { getAllSettings } = require("../settings/settings.service");
const { normalizeBaseUrl } = require("../seo/seo.model");
const {
  buildProductFeedFields,
  buildMerchantItemXml
} = require("../google-merchant/google-merchant.model");
const { buildFacebookChannelXml } = require("./facebook-feed.model");

async function generateFacebookProductFeedXml() {
  const [catalogStore, settings] = await Promise.all([readCatalogStore(), getAllSettings()]);
  const baseUrl = normalizeBaseUrl(
    settings.seoDefaults.canonicalDomain,
    env.publicBaseUrl
  );
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

  return buildFacebookChannelXml(
    {
      title: settings.storeProfile.storeName || "Jenix India",
      link: baseUrl,
      description: "Facebook product feed for Jenix Commerce products."
    },
    items
  );
}

module.exports = {
  generateFacebookProductFeedXml
};
