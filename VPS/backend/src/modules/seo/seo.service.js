const { env } = require("../../config/env");
const { HttpError } = require("../../common/http-error");
const { readCatalogStore } = require("../../database/catalog-store");
const { readContentStore } = require("../../database/content-store");
const { getAllSettings } = require("../settings/settings.service");
const { cloneDefaultContentStore, isBlogPublished } = require("../blogs/blogs.model");
const {
  normalizeBaseUrl,
  collapseText,
  mapSchemaAvailability,
  buildCategoryPathNames,
  buildSitemapIndexXml,
  buildUrlSetXml
} = require("./seo.model");

function ensureContentStoreShape(store) {
  const defaults = cloneDefaultContentStore();
  let changed = false;

  if (!Array.isArray(store.blogCategories)) {
    store.blogCategories = defaults.blogCategories;
    changed = true;
  }
  if (!Array.isArray(store.blogs)) {
    store.blogs = [];
    changed = true;
  }

  return changed;
}

function buildCanonicalBaseUrl(settings) {
  return normalizeBaseUrl(settings.seoDefaults.canonicalDomain, env.publicBaseUrl);
}

function buildProductPageMeta(product, settings) {
  const baseUrl = buildCanonicalBaseUrl(settings);
  return {
    metaTitle: product.googleShoppingTitle || product.title,
    metaDescription:
      collapseText(product.shortDescription) ||
      collapseText(product.googleShoppingDescription) ||
      collapseText(product.fullDescription) ||
      product.title,
    canonicalUrl: `${baseUrl}/products/${product.slug}`,
    ogImageUrl:
      (Array.isArray(product.images) && product.images[0]) ||
      settings.seoDefaults.defaultOgImageUrl ||
      ""
  };
}

function buildBreadcrumbJsonLd(breadcrumb, baseUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumb.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href?.startsWith("http")
        ? item.href
        : `${baseUrl}${item.href || "/"}`
    }))
  };
}

function buildProductJsonLd(product, meta, settings, categoryPathNames) {
  const imageList = Array.isArray(product.images) ? product.images.filter(Boolean) : [];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${meta.canonicalUrl}#product`,
    name: product.googleShoppingTitle || product.title,
    description: meta.metaDescription,
    sku: product.sku,
    mpn: product.mpn || product.modelNumber || undefined,
    gtin: product.gtin || undefined,
    image: imageList,
    category: categoryPathNames.join(" > "),
    url: meta.canonicalUrl,
    offers: {
      "@id": `${meta.canonicalUrl}#offer`
    },
    brand: product.brand
      ? {
          "@type": "Brand",
          name: product.brand
        }
      : {
          "@type": "Brand",
          name: settings.storeProfile.storeName || "Jenix India"
        }
  };
}

function buildReturnPolicyJsonLd(settings) {
  const invoiceTerms = collapseText(settings.invoiceSettings?.invoiceTerms).toLowerCase();
  if (
    !invoiceTerms ||
    ![
      "not be taken back",
      "no return",
      "not returnable",
      "non-returnable"
    ].some((phrase) => invoiceTerms.includes(phrase))
  ) {
    return undefined;
  }

  return {
    "@type": "MerchantReturnPolicy",
    returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted"
  };
}

function buildOfferJsonLd(product, meta, settings) {
  const returnPolicy = buildReturnPolicyJsonLd(settings);
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    "@id": `${meta.canonicalUrl}#offer`,
    url: meta.canonicalUrl,
    priceCurrency: "INR",
    price: Number(product.salePrice || 0).toFixed(2),
    availability: mapSchemaAvailability(product),
    itemCondition: "https://schema.org/NewCondition",
    seller: {
      "@type": "Organization",
      name: settings.storeProfile.storeName || "Jenix India"
    },
    hasMerchantReturnPolicy: returnPolicy,
    itemOffered: {
      "@id": `${meta.canonicalUrl}#product`
    }
  };
}

async function buildProductPageSeoPayload(product, breadcrumb) {
  const [settings, catalogStore] = await Promise.all([getAllSettings(), readCatalogStore()]);
  const categoriesById = new Map(
    catalogStore.categories.map((category) => [category.id, category])
  );
  const categoryPathNames = buildCategoryPathNames(categoriesById, product.subcategoryId || product.categoryId);
  const meta = buildProductPageMeta(product, settings);
  const baseUrl = buildCanonicalBaseUrl(settings);

  return {
    seo: meta,
    structuredData: {
      product: buildProductJsonLd(product, meta, settings, categoryPathNames),
      offer: buildOfferJsonLd(product, meta, settings),
      breadcrumb: buildBreadcrumbJsonLd(breadcrumb, baseUrl)
    }
  };
}

async function collectSitemapEntries() {
  const [settings, catalogStore, rawContentStore] = await Promise.all([
    getAllSettings(),
    readCatalogStore(),
    readContentStore()
  ]);

  if (!settings.seoDefaults.sitemapEnabled) {
    throw new HttpError(404, "Sitemap is disabled.");
  }

  const contentStore = rawContentStore;
  ensureContentStoreShape(contentStore);

  const baseUrl = buildCanonicalBaseUrl(settings);
  const productEntries = catalogStore.products
    .filter((product) => product.isActive)
    .map((product) => ({
      loc: `${baseUrl}/products/${product.slug}`,
      lastmod: product.updatedAt || product.createdAt || settings.meta.updatedAt
    }));

  const categoryEntries = catalogStore.categories
    .filter((category) => category.isActive)
    .map((category) => ({
      loc: `${baseUrl}/categories/${category.slug}`,
      lastmod: category.updatedAt || category.createdAt || settings.meta.updatedAt
    }));

  const blogEntries = contentStore.blogs
    .filter((blog) => isBlogPublished(blog))
    .map((blog) => ({
      loc: `${baseUrl}/guides/${blog.slug}`,
      lastmod: blog.updatedAt || blog.createdAt || settings.meta.updatedAt
    }));

  return {
    baseUrl,
    updatedAt: settings.meta.updatedAt,
    products: productEntries,
    categories: categoryEntries,
    blogs: blogEntries
  };
}

async function generateSitemapIndexXml() {
  const entries = await collectSitemapEntries();
  return buildSitemapIndexXml([
    {
      loc: `${entries.baseUrl}/sitemaps/products.xml`,
      lastmod: entries.updatedAt
    },
    {
      loc: `${entries.baseUrl}/sitemaps/categories.xml`,
      lastmod: entries.updatedAt
    },
    {
      loc: `${entries.baseUrl}/sitemaps/blogs.xml`,
      lastmod: entries.updatedAt
    }
  ]);
}

async function generateTypedSitemapXml(type) {
  const entries = await collectSitemapEntries();
  return buildUrlSetXml(entries[type] || []);
}

function resolveProductImageUrl(img, apiBaseUrl) {
  const raw = typeof img === "string" ? img : (img?.url || img?.thumbnail || "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${apiBaseUrl}/static/uploads/${raw.replace(/^\/+/, "")}`;
}

async function generateProductFeedXml() {
  const [settings, catalogStore] = await Promise.all([getAllSettings(), readCatalogStore()]);
  const baseUrl = buildCanonicalBaseUrl(settings);
  const apiBaseUrl = env.publicBaseUrl;
  const storeName = settings.storeProfile?.storeName || "Jenix India";

  const items = catalogStore.products
    .filter((p) => p.isActive)
    .map((p) => {
      const salePrice = Number(p.salePrice || p.basePrice || 0);
      const basePrice = Number(p.basePrice || 0);
      const gstRate = Number(p.gstRate || 18);
      const priceInclTax = (salePrice * (1 + gstRate / 100)).toFixed(2);
      const regularInclTax = (basePrice * (1 + gstRate / 100)).toFixed(2);
      const isOnSale = basePrice > salePrice && basePrice > 0;
      const availability = p.stockStatus === "out_of_stock" ? "out of stock" : "in stock";
      const images = Array.isArray(p.images) ? p.images : [];
      const imageLink = resolveProductImageUrl(images[0], apiBaseUrl);
      const additionalImages = images.slice(1, 4)
        .map((img) => resolveProductImageUrl(img, apiBaseUrl))
        .filter(Boolean);
      const link = `${baseUrl}/products/${p.slug}`;
      const title = escapeXml(p.googleShoppingTitle || p.title || "");
      const description = escapeXml(
        collapseText(p.googleShoppingDescription || p.shortDescription || p.fullDescription || p.title)
      );

      const lines = [
        `    <item>`,
        `      <g:id>${escapeXml(p.sku || p.id)}</g:id>`,
        `      <g:title>${title}</g:title>`,
        `      <g:description>${description}</g:description>`,
        `      <g:link>${escapeXml(link)}</g:link>`,
        imageLink ? `      <g:image_link>${escapeXml(imageLink)}</g:image_link>` : null,
        ...additionalImages.map((u) => `      <g:additional_image_link>${escapeXml(u)}</g:additional_image_link>`),
        isOnSale
          ? `      <g:price>${escapeXml(regularInclTax)} INR</g:price>\n      <g:sale_price>${escapeXml(priceInclTax)} INR</g:sale_price>`
          : `      <g:price>${escapeXml(priceInclTax)} INR</g:price>`,
        `      <g:availability>${availability}</g:availability>`,
        `      <g:condition>new</g:condition>`,
        `      <g:brand>${escapeXml(p.brand || storeName)}</g:brand>`,
        p.gtin ? `      <g:gtin>${escapeXml(p.gtin)}</g:gtin>` : null,
        (p.modelNumber || p.mpn) ? `      <g:mpn>${escapeXml(p.modelNumber || p.mpn)}</g:mpn>` : null,
        p.googleProductCategory ? `      <g:google_product_category>${escapeXml(p.googleProductCategory)}</g:google_product_category>` : null,
        p.productType ? `      <g:product_type>${escapeXml(p.productType)}</g:product_type>` : null,
        `    </item>`
      ].filter((line) => line !== null);

      return lines.join("\n");
    });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
    `  <channel>`,
    `    <title>${escapeXml(storeName)}</title>`,
    `    <link>${escapeXml(baseUrl)}</link>`,
    `    <description>${escapeXml(storeName)} Product Feed</description>`,
    ...items,
    `  </channel>`,
    `</rss>`
  ].join("\n");
}

async function generateRobotsTxt() {
  const settings = await getAllSettings();
  const baseUrl = buildCanonicalBaseUrl(settings);
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /account",
    "Disallow: /cart",
    "Disallow: /checkout",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`
  ].join("\n");
}

module.exports = {
  buildProductPageSeoPayload,
  generateSitemapIndexXml,
  generateTypedSitemapXml,
  generateRobotsTxt,
  generateProductFeedXml
};
