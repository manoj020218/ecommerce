import fs from "fs/promises";
import path from "path";
import { stringify } from "csv-stringify/sync";

/** Load JSON file; return fallback if missing or invalid. */
export async function loadJson(filePath, fallback = []) {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** Save JSON file with pretty-print. */
export async function saveJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** Append one product to products_raw.json (array). */
export async function appendRaw(filePath, product) {
  const existing = await loadJson(filePath, []);
  existing.push(product);
  await saveJson(filePath, existing);
}

/**
 * Generate products_clean.csv.
 * Open in Excel/Sheets to fill in hsnCode, gstRate, category corrections,
 * then feed the corrected file back into your import pipeline.
 */
export async function exportCsv(products, filePath) {
  const rows = products.map((p) => ({
    title: p.title || "",
    slug: p.slug || "",
    oldUrl: p.oldUrl || "",
    category: p.category || "",
    sku: p.sku || "",
    brand: p.brand || "",
    modelNumber: p.modelNumber || "",
    basePrice: p.basePrice || "",
    salePrice: p.salePrice || "",
    discountPercent: p.discountPercent || "",
    shortDescription: p.shortDescription || "",
    fullDescription: (p.fullDescription || "").replace(/\n+/g, " ").slice(0, 2000),
    keyFeatures: Array.isArray(p.keyFeatures) ? p.keyFeatures.join(" | ") : "",
    specifications: p.specifications
      ? Object.entries(p.specifications)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" | ")
      : "",
    images: Array.isArray(p.images)
      ? p.images.map((img) => img.medium || img.original || "").join(" | ")
      : "",
    seoTitle: p.seoTitle || "",
    seoDescription: p.seoDescription || "",
    // ── Fill these columns in Excel before importing ──
    hsnCode: "",
    gstRate: "",
    isActive: "true",
    stockStatus: "in_stock",
    notes: p.notes || "",
  }));

  const csv = stringify(rows, { header: true });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, csv, "utf-8");
  console.log(`[export] CSV written: ${filePath} (${rows.length} rows)`);
}

/**
 * Generate products_import.json shaped for direct MongoDB insertion.
 * hsnCode and gstRate are left as empty string / 0 — fill via the CSV
 * review step before importing.
 */
export async function exportImport(products, filePath) {
  const docs = products.map((p) => ({
    title: p.title || "",
    slug: p.slug || "",
    sku: p.sku || "",
    brand: p.brand || "",
    modelNumber: p.modelNumber || "",
    category: p.category || "",
    basePrice: Number(p.basePrice) || 0,
    salePrice: Number(p.salePrice) || 0,
    discountPercent: Number(p.discountPercent) || 0,
    shortDescription: p.shortDescription || "",
    fullDescription: p.fullDescription || "",
    keyFeatures: Array.isArray(p.keyFeatures) ? p.keyFeatures : [],
    specifications: p.specifications || {},
    images: Array.isArray(p.images)
      ? p.images.map((img) => ({
          url: img.medium || img.original || "",
          thumbnail: img.thumbnail || "",
          medium: img.medium || "",
          large: img.large || "",
          alt: p.title || "",
        }))
      : [],
    seoTitle: p.seoTitle || p.title || "",
    seoDescription: p.seoDescription || p.shortDescription || "",
    oldUrl: p.oldUrl || "",
    hsnCode: "",
    gstRate: 0,
    isActive: true,
    stockStatus: "in_stock",
    stockQty: 0,
    _migrated: true,
    _migratedAt: new Date().toISOString(),
  }));

  await saveJson(filePath, docs);
  console.log(`[export] Import JSON written: ${filePath} (${docs.length} products)`);
}

/** Write migration_report.json summary. */
export async function exportReport(stats, filePath) {
  await saveJson(filePath, { ...stats, generatedAt: new Date().toISOString() });
  console.log(`[export] Report written: ${filePath}`);
}
