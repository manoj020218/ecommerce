#!/usr/bin/env node
/**
 * restore-from-migration.js
 * Run from VPS/ directory: node scripts/restore-from-migration.js [--dry-run]
 *
 * Restores the catalog from migration data + cleaned descriptions.
 * Used to recover after the catalog-store.json was accidentally wiped.
 *
 * What it does:
 *  - Reads products_import.json (384 migration products)
 *  - Reads products_descriptions_cleaned.json (cleaned descriptions)
 *  - Merges: applies cleaned descriptions over migration product data
 *  - Writes ALL products directly to catalog-store.json (no API calls)
 *  - Skips products whose slug already exists in the store
 *
 * What is NOT recovered (was lost in the corruption incident):
 *  - Manually entered HSN codes (were not in migration data)
 *  - Manual price changes made after June 4 import
 *
 * After running: re-enter HSN codes via admin panel for each product.
 */

"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { readCatalogStore, writeCatalogStore } = require("../backend/src/database/catalog-store");
const { generateId } = require("../backend/src/common/identity");
const { env } = require("../backend/src/config/env");

const importData = require("./migration/output/products_import.json");
// Cleaned descriptions may be in migration/output/ OR in the scripts root (VPS copy)
let cleanedDescs;
try {
  cleanedDescs = require("./migration/output/products_descriptions_cleaned.json");
} catch (_) {
  cleanedDescs = require("./products_descriptions_cleaned.json");
}

const isDryRun = process.argv.includes("--dry-run");

// Build lookup map from cleaned descriptions by slug
const descBySlug = new Map();
for (const d of cleanedDescs) {
  if (d.slug) descBySlug.set(normalizeSlug(d.slug), d);
  if (d.oldUrl) descBySlug.set(d.oldUrl.trim().toLowerCase(), d);
}

function normalizeSlug(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function generateSku(existingSkus, counter) {
  for (;;) {
    const sku = `JNX-${String(counter).padStart(6, "0")}`;
    if (!existingSkus.has(sku)) return sku;
    counter += 1;
  }
}

async function main() {
  const store = await readCatalogStore();
  const existingSlugs = new Set(store.products.map((p) => p.slug));
  const existingSkus = new Set(store.products.map((p) => p.sku));
  let skuCounter = store.products.length + 1;

  const imported = [];
  const skipped = [];
  const failed = [];

  for (const row of importData) {
    const slug = row.slug || slugify(row.title);

    if (existingSlugs.has(slug)) {
      skipped.push(slug);
      continue;
    }

    try {
      const sku = generateSku(existingSkus, skuCounter);
      skuCounter += 1;
      existingSkus.add(sku);

      // Use migration base URL for images
      const publicBase = env.publicBaseUrl || "https://api.jenixindia.com";
      const migBase = `${publicBase}/static/migration`;

      const images = (row.images || []).map((img) => ({
        url: `${migBase}/${img.url}`,
        thumbnail: `${migBase}/${img.thumbnail}`,
        medium: `${migBase}/${img.medium || img.url}`,
        large: `${migBase}/${img.large || img.url}`,
        alt: img.alt || row.title
      }));

      const now = new Date().toISOString();
      const basePrice = Number(row.basePrice) || 0;
      const rawSale = Number(row.salePrice);
      const salePrice = rawSale && rawSale < basePrice ? rawSale : basePrice;
      const productId = generateId("prd");

      // Prefer cleaned descriptions; fall back to migration data descriptions
      const cleanedMatch = descBySlug.get(normalizeSlug(slug)) ||
        (row.oldUrl ? descBySlug.get(row.oldUrl.trim().toLowerCase()) : null);
      const shortDescription = (cleanedMatch && cleanedMatch.shortDescription) || row.shortDescription || "";
      const fullDescription = (cleanedMatch && cleanedMatch.fullDescription) || row.fullDescription || "";

      const product = {
        id: productId,
        title: row.title,
        slug,
        sku,
        oldUrl: row.oldUrl || "",
        categoryId: null,
        subcategoryId: null,
        brand: row.brand || "",
        modelNumber: row.modelNumber || "",
        mpn: "",
        gtin: "",
        hsnCode: "",
        gstRate: Number(row.gstRate) || 18,
        priceIncludesGst: false,
        shippingIncluded: false,
        basePrice,
        salePrice,
        images,
        shortDescription,
        fullDescription,
        keyFeatures: Array.isArray(row.keyFeatures) ? row.keyFeatures.filter(Boolean) : [],
        specifications: row.specifications || {},
        downloads: [],
        technicalKeywords: [],
        customerKeywords: [],
        useCases: [],
        problemStatements: [],
        relations: { similar: [], accessories: [], crossSell: [], spareParts: [], required: [] },
        moq: 1,
        bulkPricingEnabled: false,
        bulkPriceSlabs: [],
        priceGroupPrices: [],
        customerSpecificPrices: [],
        quoteRequiredAboveQty: null,
        deadWeightKg: 0,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        shippingClass: "normal",
        googleShoppingTitle: "",
        googleShoppingDescription: "",
        googleProductCategory: "",
        productType: "",
        videos: [],
        videoUrls: [],
        metaTitle: row.seoTitle || "",
        metaDescription: row.seoDescription || "",
        metaKeywords: "",
        stockQty: 0,
        reservedQty: 0,
        stockStatus: "in_stock",
        stockVisibility: "hide_quantity",
        allowBackorder: false,
        maxOrderQty: 1000,
        lowStockThreshold: 0,
        isActive: row.isActive !== false,
        tags: [],
        productLabel: "",
        createdAt: now,
        updatedAt: now
      };

      if (!isDryRun) {
        store.products.push(product);
        existingSlugs.add(slug);
      }
      imported.push({ id: productId, slug, title: row.title.slice(0, 60) });
    } catch (err) {
      failed.push({ slug, error: err.message });
    }
  }

  if (!isDryRun && imported.length > 0) {
    await writeCatalogStore(store);
  }

  console.log(`\nRestore ${isDryRun ? "(DRY RUN) " : ""}complete:`);
  console.log(`  Restored : ${imported.length} products`);
  console.log(`  Skipped  : ${skipped.length} (already exist)`);
  console.log(`  Failed   : ${failed.length}`);
  console.log("\nNOTE: HSN codes are empty — re-enter them in the admin panel.");
  console.log("NOTE: Prices are from the original migration data.");
  console.log("NOTE: Descriptions are the cleaned versions from products_descriptions_cleaned.json.");

  if (failed.length > 0) {
    console.log("\nFailed products:");
    for (const f of failed) console.log(`  ${f.slug}: ${f.error}`);
  }

  if (isDryRun && imported.length > 0) {
    console.log("\nFirst 5 would-be restores:");
    for (const p of imported.slice(0, 5)) console.log(`  [${p.id}] ${p.title}`);
  }
}

main().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
