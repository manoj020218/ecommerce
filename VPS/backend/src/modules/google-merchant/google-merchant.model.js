const {
  PRODUCT_CONDITION,
  escapeXml,
  collapseText,
  formatInrAmount,
  formatWeightKg,
  mapFeedAvailability,
  buildCategoryPathNames
} = require("../seo/seo.model");

function buildIdentifierExists(product) {
  return product.gtin || product.mpn || product.brand ? "yes" : "no";
}

function buildProductType(product, categoryPathNames) {
  return collapseText(product.productType) || categoryPathNames.join(" > ");
}

function buildFeedTitle(product) {
  return collapseText(product.googleShoppingTitle) || collapseText(product.title);
}

function buildFeedDescription(product) {
  return (
    collapseText(product.googleShoppingDescription) ||
    collapseText(product.shortDescription) ||
    collapseText(product.fullDescription) ||
    collapseText(product.title)
  );
}

function resolveImageUrl(img, apiBaseUrl) {
  const raw = typeof img === "string" ? img : (img?.url || img?.thumbnail || "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${apiBaseUrl}/static/uploads/${raw.replace(/^\/+/, "")}`;
}

function buildProductFeedFields(product, options) {
  const apiBaseUrl = options.apiBaseUrl || "";
  const rawImages = Array.isArray(product.images) ? product.images : [];
  const resolvedImages = rawImages.map((img) => resolveImageUrl(img, apiBaseUrl)).filter(Boolean);
  const primaryImage = resolvedImages[0] || options.defaultOgImageUrl || "";
  const additionalImages = resolvedImages.slice(1, 10);
  const categoryPathNames = buildCategoryPathNames(
    options.categoriesById,
    product.subcategoryId || product.categoryId
  );
  const regularPrice = Number(product.basePrice || product.salePrice || 0);
  const currentPrice = Number(product.salePrice || 0);
  const hasSalePrice = regularPrice > currentPrice && currentPrice > 0;

  return {
    id: product.sku || product.id,
    title: buildFeedTitle(product),
    description: buildFeedDescription(product),
    link: `${options.baseUrl}/products/${product.slug}`,
    imageLink: primaryImage,
    additionalImages,
    availability: mapFeedAvailability(product),
    price: formatInrAmount(hasSalePrice ? regularPrice : currentPrice),
    salePrice: hasSalePrice ? formatInrAmount(currentPrice) : "",
    brand: collapseText(product.brand) || collapseText(options.storeName),
    mpn: collapseText(product.mpn) || collapseText(product.modelNumber),
    gtin: collapseText(product.gtin),
    condition: PRODUCT_CONDITION,
    googleProductCategory: collapseText(product.googleProductCategory),
    productType: buildProductType(product, categoryPathNames),
    shippingWeight: formatWeightKg(product.deadWeightKg),
    identifierExists: buildIdentifierExists(product)
  };
}

function buildMerchantItemXml(fields) {
  const rows = [
    `    <g:id>${escapeXml(fields.id)}</g:id>`,
    `    <title>${escapeXml(fields.title)}</title>`,
    `    <description>${escapeXml(fields.description)}</description>`,
    `    <link>${escapeXml(fields.link)}</link>`
  ];

  if (fields.imageLink) {
    rows.push(`    <g:image_link>${escapeXml(fields.imageLink)}</g:image_link>`);
  }
  for (const imageUrl of fields.additionalImages) {
    rows.push(`    <g:additional_image_link>${escapeXml(imageUrl)}</g:additional_image_link>`);
  }

  rows.push(`    <g:availability>${escapeXml(fields.availability)}</g:availability>`);
  rows.push(`    <g:price>${escapeXml(fields.price)}</g:price>`);

  if (fields.salePrice) {
    rows.push(`    <g:sale_price>${escapeXml(fields.salePrice)}</g:sale_price>`);
  }
  if (fields.brand) {
    rows.push(`    <g:brand>${escapeXml(fields.brand)}</g:brand>`);
  }
  if (fields.mpn) {
    rows.push(`    <g:mpn>${escapeXml(fields.mpn)}</g:mpn>`);
  }
  if (fields.gtin) {
    rows.push(`    <g:gtin>${escapeXml(fields.gtin)}</g:gtin>`);
  }
  if (fields.googleProductCategory) {
    rows.push(
      `    <g:google_product_category>${escapeXml(fields.googleProductCategory)}</g:google_product_category>`
    );
  }
  if (fields.productType) {
    rows.push(`    <g:product_type>${escapeXml(fields.productType)}</g:product_type>`);
  }

  rows.push(`    <g:condition>${escapeXml(fields.condition)}</g:condition>`);
  rows.push(`    <g:shipping_weight>${escapeXml(fields.shippingWeight)}</g:shipping_weight>`);
  rows.push(`    <g:identifier_exists>${escapeXml(fields.identifierExists)}</g:identifier_exists>`);

  return `  <item>\n${rows.join("\n")}\n  </item>`;
}

module.exports = {
  buildProductFeedFields,
  buildMerchantItemXml
};
