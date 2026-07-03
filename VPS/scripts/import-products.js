#!/usr/bin/env node
// Run from VPS/ directory: node scripts/import-products.js [--dry-run]
// Imports products from scripts/migration/output/products_import.json into the catalog store

"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { readCatalogStore, writeCatalogStore } = require("../backend/src/database/catalog-store");
const { generateId } = require("../backend/src/common/identity");
const { env } = require("../backend/src/config/env");

const importData = require("./migration/output/products_import.json");

const isDryRun = process.argv.includes("--dry-run");
const PUBLIC_MIGRATION_BASE = `${env.publicBaseUrl}/static/migration`;

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

      const images = (row.images || []).map((img) => ({
        url: `${PUBLIC_MIGRATION_BASE}/${img.url}`,
        thumbnail: `${PUBLIC_MIGRATION_BASE}/${img.thumbnail}`
      }));

      const now = new Date().toISOString();
      const basePrice = Number(row.basePrice) || 0;
      const rawSale = Number(row.salePrice);
      const salePrice = rawSale && rawSale <= basePrice ? rawSale : basePrice;
      const productId = generateId("prd");

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
        gstRate: 0,
        basePrice,
        salePrice,
        images,
        shortDescription: row.shortDescription || "",
        fullDescription: row.fullDescription || "",
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
        isActive: true,
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

  console.log(`\nImport ${isDryRun ? "(DRY RUN) " : ""}complete:`);
  console.log(`  Imported : ${imported.length}`);
  console.log(`  Skipped  : ${skipped.length} (already exist)`);
  console.log(`  Failed   : ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed products:");
    for (const f of failed) console.log(`  ${f.slug}: ${f.error}`);
  }

  if (isDryRun && imported.length > 0) {
    console.log("\nFirst 5 would-be imports:");
    for (const p of imported.slice(0, 5)) console.log(`  [${p.id}] ${p.title}`);
  }
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
