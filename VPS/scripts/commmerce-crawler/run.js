#!/usr/bin/env node
/**
 * commmerce-site-crawler  —  entry point
 *
 * Usage:
 *   node run.js --mode discover          # Step 1: find all product URLs
 *   node run.js --mode crawl --limit 10  # Step 2a: test-crawl first 10 products
 *   node run.js --mode crawl             # Step 2b: crawl all products
 *   node run.js --mode export            # Step 3: generate CSV + MongoDB JSON
 *   node run.js --mode all               # Steps 1-3 in sequence
 */

import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { discoverUrls, crawlProducts } from "./crawler.js";
import { exportCsv, exportImport, exportReport, loadJson } from "./exporters.js";
import { OUTPUT_DIR, IMAGE_DIR, SITE_URL } from "./config.js";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const mode = getArg("--mode") || "help";
const limitArg = getArg("--limit");
const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(IMAGE_DIR, { recursive: true });

// ─── Export step ──────────────────────────────────────────────────────────────

async function runExport() {
  const rawFile = path.join(OUTPUT_DIR, "products_raw.json");
  const csvFile = path.join(OUTPUT_DIR, "products_clean.csv");
  const importFile = path.join(OUTPUT_DIR, "products_import.json");
  const reportFile = path.join(OUTPUT_DIR, "migration_report.json");
  const failedFile = path.join(OUTPUT_DIR, "failed_urls.json");

  const products = await loadJson(rawFile, []);
  if (products.length === 0) {
    console.error("[export] No products in products_raw.json. Run crawl first.");
    return;
  }

  await exportCsv(products, csvFile);
  await exportImport(products, importFile);

  const failed = await loadJson(failedFile, []);
  const withImages = products.filter((p) => p.images?.length > 0).length;

  await exportReport(
    {
      site: SITE_URL,
      totalProducts: products.length,
      productsWithImages: withImages,
      productsWithoutImages: products.length - withImages,
      failedUrls: failed.length,
      outputFiles: {
        raw: rawFile,
        csv: csvFile,
        importJson: importFile,
        failedUrls: failedFile,
      },
    },
    reportFile
  );
}

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║   commmerce.com  Site Crawler  v1.0.0   ║`);
console.log(`╚══════════════════════════════════════════╝`);
console.log(`Site: ${SITE_URL}`);
console.log(`Mode: ${mode}${limit < Infinity ? ` (limit: ${limit})` : ""}\n`);

try {
  if (mode === "discover") {
    await discoverUrls(OUTPUT_DIR);
  } else if (mode === "crawl") {
    await crawlProducts(OUTPUT_DIR, IMAGE_DIR, limit);
  } else if (mode === "export") {
    await runExport();
  } else if (mode === "all") {
    await discoverUrls(OUTPUT_DIR);
    await crawlProducts(OUTPUT_DIR, IMAGE_DIR, limit);
    await runExport();
  } else {
    console.log(`
  Quick start:
    1. cp .env.example .env          # then set SITE_URL=https://yourstore.com
    2. npm install
    3. npx playwright install chromium
    4. node run.js --mode discover          # find all product URLs
    5. node run.js --mode crawl --limit 10  # test with 10 products first
    6. node run.js --mode crawl             # full crawl
    7. node run.js --mode export            # generate CSV + import JSON

  Output (./output/):
    urls.json              All discovered product URLs
    products_raw.json      Raw scraped data (JSON)
    products_clean.csv     Open in Excel — fill hsnCode / gstRate / category
    products_import.json   Ready for MongoDB import
    migration_report.json  Stats summary
    failed_urls.json       URLs that could not be scraped
    images/<slug>/         WebP images at thumbnail / medium / large
    `);
  }
} catch (err) {
  console.error(`\n[fatal] ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
