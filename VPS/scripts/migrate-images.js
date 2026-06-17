#!/usr/bin/env node
/**
 * Migrate product images from migration output → backend uploads.
 *
 * Source: scripts/migration/output/images/{slug}/{n}-{size}.webp
 * Dest:   backend/uploads/products/{sku}/{n}-{size}.webp
 * Catalog: backend/src/database/json/catalog-store.json
 *
 * Usage:
 *   node scripts/migrate-images.js [--dry-run]
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const DRY_RUN = process.argv.includes("--dry-run");

const ROOT = path.resolve(__dirname, "..");
const IMAGES_SRC = path.join(ROOT, "scripts/migration/output/images");
const UPLOADS_DEST = path.join(ROOT, "backend/uploads/products");
const CATALOG_PATH = path.join(ROOT, "backend/src/database/json/catalog-store.json");

function isMigrationImage(src) {
  if (!src || typeof src !== "string") return false;
  if (src.startsWith("http") || src.startsWith("/static/uploads")) return false;
  return true;
}

function resolveImageSrc(image) {
  if (typeof image === "string") return image;
  return image?.url || image?.medium || image?.thumbnail || "";
}

async function run() {
  const raw = await fsp.readFile(CATALOG_PATH, "utf-8");
  const store = JSON.parse(raw);
  const products = Array.isArray(store.products) ? store.products : [];

  const stats = { products: 0, copied: 0, skipped: 0, errors: 0, noSource: 0 };

  for (const product of products) {
    const sku = product.sku || "";
    const slug = product.slug || "";
    const images = Array.isArray(product.images) ? product.images : [];

    if (!sku || images.length === 0) continue;

    const hasMigrationImages = images.some((img) => isMigrationImage(resolveImageSrc(img)));
    if (!hasMigrationImages) continue;

    stats.products++;

    const destDir = path.join(UPLOADS_DEST, sku);
    if (!DRY_RUN) {
      await fsp.mkdir(destDir, { recursive: true });
    }

    const newImages = [];

    for (const image of images) {
      const src = resolveImageSrc(image);

      if (!isMigrationImage(src)) {
        newImages.push(image);
        continue;
      }

      // src looks like: images/{slug}/{n}-medium.webp
      // Strip leading "images/" if present
      const relativeSrc = src.replace(/^images\//, "");
      const srcFile = path.join(IMAGES_SRC, relativeSrc);

      if (!fs.existsSync(srcFile)) {
        console.warn(`  [MISSING] ${srcFile}`);
        stats.noSource++;
        newImages.push(image);
        continue;
      }

      const filename = path.basename(srcFile);
      const destFile = path.join(destDir, filename);

      if (!DRY_RUN) {
        await fsp.copyFile(srcFile, destFile);
      }
      stats.copied++;

      const publicPath = `/static/uploads/products/${sku}/${filename}`;

      if (typeof image === "string") {
        newImages.push(publicPath);
      } else {
        // Rebuild the image object with updated paths for each size variant
        const updated = { ...image };
        for (const key of ["url", "thumbnail", "medium", "large"]) {
          if (image[key] && isMigrationImage(image[key])) {
            const variantFile = path.basename(image[key].replace(/^images\//, ""));
            updated[key] = `/static/uploads/products/${sku}/${variantFile}`;
          }
        }
        newImages.push(updated);
      }
    }

    product.images = newImages;
  }

  if (!DRY_RUN) {
    await fsp.writeFile(CATALOG_PATH, JSON.stringify(store, null, 2), "utf-8");
    console.log("catalog-store.json updated.");
  }

  console.log(`\nDone${DRY_RUN ? " (dry run)" : ""}:`);
  console.log(`  Products processed : ${stats.products}`);
  console.log(`  Images copied      : ${stats.copied}`);
  console.log(`  Skipped (no src)   : ${stats.noSource}`);
  console.log(`  Errors             : ${stats.errors}`);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
