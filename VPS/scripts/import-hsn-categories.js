#!/usr/bin/env node
/**
 * import-hsn-categories.js
 * Run from VPS/ directory: node scripts/import-hsn-categories.js [--dry-run]
 *
 * Reads products_hsn_category_template.csv (filled in by user) and:
 *  1. Creates any new categories found in the "category" column
 *  2. Updates each product's hsnCode, gstRate, categoryId, subcategoryId
 *
 * CSV columns (do not change the header row):
 *   id, title, sku, slug, hsnCode, gstRate, category, subcategory
 *
 * Instructions:
 *  - Fill in hsnCode  (e.g. 8301, 8531, 8523)
 *  - Fill in gstRate  (5, 12, 18, or 28 — default 18)
 *  - Fill in category (write the category NAME, e.g. "Smart Locks")
 *  - Fill in subcategory (optional)
 *  - Leave id/title/sku/slug unchanged — they are used to match products
 */

"use strict";

const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { readCatalogStore, writeCatalogStore } = require("../backend/src/database/catalog-store");
const { generateId } = require("../backend/src/common/identity");

const CSV_FILE = path.join(__dirname, "products_hsn_category_template.csv");
const isDryRun = process.argv.includes("--dry-run");

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  const header = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const obj = {};
    header.forEach((h, i) => { obj[h.trim()] = (values[i] || "").trim(); });
    return obj;
  });
}

function parseRow(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error("CSV file not found:", CSV_FILE);
    process.exit(1);
  }

  const csvText = fs.readFileSync(CSV_FILE, "utf8");
  const rows = parseCSV(csvText);
  console.log(`Loaded ${rows.length} rows from CSV`);

  // Filter to only rows that have something to update
  const toUpdate = rows.filter(r => r.id && (r.hsnCode || r.category || r.gstRate !== "18"));
  const withHsn = rows.filter(r => r.hsnCode).length;
  const withCat = rows.filter(r => r.category).length;
  console.log(`  Rows with HSN code: ${withHsn}`);
  console.log(`  Rows with category: ${withCat}`);
  console.log(`  Rows to update: ${toUpdate.length}`);

  if (toUpdate.length === 0) {
    console.log("\nNothing to update — fill in the CSV first.");
    return;
  }

  const store = await readCatalogStore();

  // Step 1: Create categories
  const categoryNames = [...new Set(rows.map(r => r.category).filter(Boolean))];
  const subcategoryNames = [...new Set(rows.map(r => r.subcategory).filter(Boolean))];
  console.log(`\nCategories to create: ${categoryNames.length}`);

  const catByName = new Map();
  for (const cat of store.categories) {
    catByName.set(cat.name.trim().toLowerCase(), cat);
  }

  const newCats = [];
  for (const name of categoryNames) {
    if (!catByName.has(name.toLowerCase())) {
      const cat = {
        id: generateId("cat"),
        name,
        slug: slugify(name),
        description: "",
        parentId: null,
        sortOrder: store.categories.length + newCats.length,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (!isDryRun) {
        store.categories.push(cat);
        catByName.set(name.toLowerCase(), cat);
      }
      newCats.push(name);
      console.log(`  + Category: ${name}`);
    } else {
      console.log(`  = Category exists: ${name}`);
    }
  }

  // Also handle subcategories (linked to parent category)
  const subcatByName = new Map();
  for (const cat of store.categories) {
    subcatByName.set(cat.name.trim().toLowerCase(), cat);
  }

  const newSubcats = [];
  for (const subName of subcategoryNames) {
    if (!subcatByName.has(subName.toLowerCase())) {
      // Find parent by matching any category that comes before it in the CSV
      const parentRow = rows.find(r => r.subcategory === subName && r.category);
      const parentCat = parentRow ? catByName.get(parentRow.category.toLowerCase()) : null;
      const subcat = {
        id: generateId("cat"),
        name: subName,
        slug: slugify(subName),
        description: "",
        parentId: parentCat ? parentCat.id : null,
        sortOrder: store.categories.length + newCats.length + newSubcats.length,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (!isDryRun) {
        store.categories.push(subcat);
        subcatByName.set(subName.toLowerCase(), subcat);
      }
      newSubcats.push(subName);
      console.log(`  + Subcategory: ${subName} (parent: ${parentCat ? parentCat.name : "none"})`);
    }
  }

  // Step 2: Update products
  console.log(`\nUpdating ${toUpdate.length} products...`);
  let updated = 0, notFound = 0;

  const productById = new Map(store.products.map(p => [p.id, p]));

  for (const row of rows) {
    if (!row.id) continue;

    const product = productById.get(row.id);
    if (!product) {
      // Try by slug or sku
      const bySlug = store.products.find(p => p.slug === row.slug || p.sku === row.sku);
      if (!bySlug) { notFound++; continue; }
      // Use bySlug
      row.id = bySlug.id;
    }

    const prod = productById.get(row.id) || store.products.find(p => p.slug === row.slug);
    if (!prod) { notFound++; continue; }

    const patch = {};
    if (row.hsnCode) patch.hsnCode = row.hsnCode.trim();
    if (row.gstRate) patch.gstRate = Number(row.gstRate) || 18;
    if (row.category) {
      const cat = catByName.get(row.category.toLowerCase());
      if (cat) patch.categoryId = cat.id;
    }
    if (row.subcategory) {
      const subcat = subcatByName.get(row.subcategory.toLowerCase());
      if (subcat) patch.subcategoryId = subcat.id;
    }

    if (Object.keys(patch).length === 0) continue;

    if (!isDryRun) {
      const idx = store.products.findIndex(p => p.id === prod.id);
      if (idx >= 0) {
        store.products[idx] = { ...store.products[idx], ...patch, updatedAt: new Date().toISOString() };
      }
    }
    updated++;
    if (updated <= 5 || updated % 50 === 0) {
      console.log(`  [${updated}] ${prod.title.slice(0, 55)}`, Object.keys(patch).join(", "));
    }
  }

  if (notFound > 0) console.log(`  ! ${notFound} products not found (ID/slug mismatch)`);

  if (!isDryRun && (updated > 0 || newCats.length > 0 || newSubcats.length > 0)) {
    await writeCatalogStore(store);
  }

  console.log(`\n=== ${isDryRun ? "DRY RUN" : "COMPLETE"} ===`);
  console.log(`  Categories created: ${newCats.length}`);
  console.log(`  Subcategories created: ${newSubcats.length}`);
  console.log(`  Products updated: ${updated}`);
  if (isDryRun) console.log("  Run without --dry-run to apply changes.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
