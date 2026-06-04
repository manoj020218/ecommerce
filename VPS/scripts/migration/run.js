#!/usr/bin/env node
/**
 * Jenix Phase 4 - Product Migration Crawler
 *
 * Usage:
 *   node run.js --mode discover          # find all product URLs
 *   node run.js --mode crawl --limit 10  # test-crawl first 10 products
 *   node run.js --mode crawl             # crawl all products
 *   node run.js --mode export            # generate CSV + import JSON
 *   node run.js --mode all               # discover + crawl + export
 */

import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { discoverUrls, crawlProducts } from "./crawler.js";
import { exportCsv, exportImport, exportReport, loadJson } from "./exporters.js";
import { OUTPUT_DIR, IMAGE_DIR } from "./config.js";

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const mode = getArg("--mode") || "help";
const limitArg = getArg("--limit");
const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

// ─── Ensure output dirs exist ─────────────────────────────────────────────────

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

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log(`\n╔═══════════════════════════════════════╗`);
console.log(`║  Jenix Migration Crawler - Phase 4   ║`);
console.log(`╚═══════════════════════════════════════╝`);
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
  Usage:
    node run.js --mode discover          # Step 1: find all product URLs
    node run.js --mode crawl --limit 10  # Step 2a: test crawl 10 products
    node run.js --mode crawl             # Step 2b: crawl all products
    node run.js --mode export            # Step 3: generate CSV + import JSON

  Output files (./output/):
    urls.json              URLs discovered in step 1
    products_raw.json      Raw scraped data
    products_clean.csv     Open in Excel, fill HSN/GST/category corrections
    products_import.json   Ready to load into MongoDB
    migration_report.json  Stats summary
    failed_urls.json       URLs that failed to scrape
    images/<slug>/         WebP images at 3 sizes
    `);
  }
} catch (err) {
  console.error(`\n[fatal] ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
