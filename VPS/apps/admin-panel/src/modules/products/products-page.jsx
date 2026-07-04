import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import {
  formatCurrencyInr,
  splitCsvInput,
  toCsvInput
} from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { createCategory, fetchCategories } from "../categories/categories.api";
import { createHsnTaxRecord, fetchHsnTaxRecords } from "../hsn-tax/hsn-tax.api";
import { useAuthSession } from "../auth/use-auth-session";
import { API_BASE_URL } from "../../shared/api/http-client";
import {
  ProductsColumnSelector,
  loadSavedCols,
  saveCols
} from "./products-column-selector";

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || "https://test.jenixindia.com";
import {
  archiveProduct,
  bulkPatchProducts,
  createProduct,
  deleteProductImage,
  fetchProducts,
  getGoogleShoppingExportUrl,
  importProductsFile,
  updateProduct,
  uploadProductDocument,
  uploadProductImage,
  uploadProductVideo
} from "./products.api";
import { RichTextEditor } from "../../shared/components/rich-text-editor";

const BACKEND_BASE = API_BASE_URL.replace(/\/api$/, "");

function detectVideoPlatform(url) {
  try {
    const h = new URL(url).hostname.replace("www.", "");
    if (h.includes("youtube.com") || h === "youtu.be") return "youtube";
    if (h.includes("facebook.com") || h === "fb.watch") return "facebook";
    if (h.includes("instagram.com")) return "instagram";
    if (h.includes("vimeo.com")) return "vimeo";
    return "other";
  } catch { return "other"; }
}

const PLATFORM_META = {
  youtube:   { label: "YouTube",   color: "#ef4444" },
  facebook:  { label: "Facebook",  color: "#1877f2" },
  instagram: { label: "Instagram", color: "#e1306c" },
  vimeo:     { label: "Vimeo",     color: "#1ab7ea" },
  other:     { label: "Video",     color: "#6b7280" }
};

function fileExtIcon(url) {
  const ext = (url || "").split(".").pop().toLowerCase().split("?")[0];
  if (ext === "pdf") return "📄";
  if (["doc","docx"].includes(ext)) return "📝";
  if (["xls","xlsx","csv"].includes(ext)) return "📊";
  if (["zip","rar"].includes(ext)) return "🗜";
  return "📎";
}

// ── Inline Create Form (HSN / Category / Subcategory) ────────────────────────

function InlineCreateForm({ type, parentLabel, form, onChange, onSubmit, onCancel, saving, error }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{
      marginTop: 8, padding: "12px 14px", background: "var(--surface)",
      border: "1.5px solid var(--brand)", borderRadius: 8
    }}>
      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--brand)" }}>
        + Quick Create {parentLabel}
      </div>
      {type === "hsn" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <input
            placeholder="HSN Code (e.g. 8543)" value={form.hsnCode || ""}
            onChange={(e) => onChange("hsnCode", e.target.value)}
            style={{ flex: "1 1 110px", padding: "5px 9px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <input
            placeholder="GST Rate %" type="number" min="0" max="100" value={form.gstRate ?? "18"}
            onChange={(e) => onChange("gstRate", e.target.value)}
            style={{ flex: "0 1 90px", padding: "5px 9px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <input
            placeholder="Description" value={form.description || ""}
            onChange={(e) => onChange("description", e.target.value)}
            style={{ flex: "2 1 180px", padding: "5px 9px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <input
            type="date" value={form.effectiveFrom || today}
            onChange={(e) => onChange("effectiveFrom", e.target.value)}
            style={{ flex: "0 1 140px", padding: "5px 9px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </div>
      ) : (
        <input
          placeholder={`${parentLabel} name`} value={form.name || ""}
          onChange={(e) => onChange("name", e.target.value)}
          style={{ width: "100%", padding: "5px 9px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, boxSizing: "border-box" }}
        />
      )}
      {error && <p style={{ color: "var(--error)", fontSize: 12, margin: "6px 0 0" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button" className="btn btn-primary btn-small" disabled={saving}
          onClick={onSubmit}
          style={{ fontSize: 12, padding: "4px 14px" }}
        >
          {saving ? "Creating…" : "Create"}
        </button>
        <button
          type="button" className="btn btn-secondary btn-small" onClick={onCancel}
          style={{ fontSize: 12, padding: "4px 12px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Video Media Panel ─────────────────────────────────────────────────────────

function VideoMediaPanel({ videos, onChange, onUploadFile, uploadingFile, editingId, videoRef }) {
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const add = () => {
    const u = newUrl.trim();
    if (!u) return;
    onChange([...videos, { url: u, label: newLabel.trim() }]);
    setNewUrl(""); setNewLabel("");
  };

  const remove = (idx) => onChange(videos.filter((_, i) => i !== idx));

  const updateField = (idx, key, val) =>
    onChange(videos.map((v, i) => i === idx ? { ...v, [key]: val } : v));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Existing entries */}
      {videos.map((v, idx) => {
        const platform = detectVideoPlatform(v.url);
        const meta = PLATFORM_META[platform];
        const ytId = platform === "youtube" ? extractYoutubeId(v.url) : null;
        return (
          <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "#fafafa" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: ytId ? 10 : 0 }}>
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 11,
                fontWeight: 600, background: meta.color, color: "#fff", flexShrink: 0
              }}>{meta.label}</span>
              <input
                value={v.url} onChange={(e) => updateField(idx, "url", e.target.value)}
                style={{ flex: 1, fontSize: 12, padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 5 }}
                placeholder="Video URL"
              />
              <input
                value={v.label || ""} onChange={(e) => updateField(idx, "label", e.target.value)}
                style={{ width: 140, fontSize: 12, padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 5 }}
                placeholder="Label (optional)"
              />
              <button type="button" onClick={() => remove(idx)}
                style={{ background: "#fee2e2", border: "none", borderRadius: 5, padding: "4px 10px", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                ×
              </button>
            </div>
            {ytId && (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                style={{ width: "100%", maxWidth: 400, height: 225, border: "none", borderRadius: 6, display: "block" }}
                allowFullScreen title="YouTube preview"
              />
            )}
          </div>
        );
      })}

      {/* Add new video URL */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          style={{ flex: "1 1 240px", fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6 }}
          placeholder="Paste YouTube, Facebook, Instagram, Vimeo URL…"
        />
        <input
          value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
          style={{ width: 160, fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6 }}
          placeholder="Label (optional)"
        />
        <button type="button" onClick={add} className="btn btn-secondary btn-small">+ Add</button>
      </div>

      {/* File upload (only when editing) */}
      {editingId && (
        <label className="btn btn-secondary btn-small" style={{ cursor: uploadingFile ? "wait" : "pointer", width: "fit-content" }}>
          {uploadingFile ? "Uploading…" : "Upload Video File (MP4 / WebM)"}
          <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/mov,video/avi" className="hidden-input"
            disabled={uploadingFile}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUploadFile(f); }}
          />
        </label>
      )}
      {!editingId && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          Video file upload available after saving the product.
        </p>
      )}
    </div>
  );
}

// ── File / Document Media Panel ───────────────────────────────────────────────

function FileMediaPanel({ downloads, onChange, onUploadFile, uploadingFile, editingId, fileRef }) {
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");

  const addLink = () => {
    if (!newTitle.trim() || !newUrl.trim()) return;
    onChange([...downloads, { title: newTitle.trim(), url: newUrl.trim() }]);
    setNewTitle(""); setNewUrl("");
  };

  const remove = (idx) => onChange(downloads.filter((_, i) => i !== idx));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Existing entries */}
      {downloads.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No files or links yet.</p>
      )}
      {downloads.map((d, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>{fileExtIcon(d.url)}</span>
          <a href={d.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: "var(--info)", flex: 1, wordBreak: "break-all" }}>
            {d.title}
          </a>
          <button type="button" onClick={() => remove(idx)}
            style={{ background: "#fee2e2", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 13 }}>
            ×
          </button>
        </div>
      ))}

      {/* Add URL link */}
      <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 10, background: "#fafafa" }}>
        <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px", color: "var(--muted)" }}>Add external link (datasheet website, Google Drive, etc.)</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            style={{ flex: "0 0 180px", fontSize: 13, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5 }}
            placeholder="Title (e.g. Datasheet)" />
          <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
            style={{ flex: 1, fontSize: 13, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5 }}
            placeholder="https://..." />
          <button type="button" onClick={addLink} className="btn btn-secondary btn-small">+ Add Link</button>
        </div>
      </div>

      {/* File upload */}
      {editingId ? (
        <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 10, background: "#fafafa" }}>
          <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px", color: "var(--muted)" }}>Upload file (PDF, Word, Excel…)</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)}
              style={{ flex: "0 0 180px", fontSize: 13, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5 }}
              placeholder="File title (e.g. User Manual)" />
            <label className="btn btn-secondary btn-small" style={{ cursor: uploadingFile ? "wait" : "pointer" }}>
              {uploadingFile ? "Uploading…" : "Choose & Upload File"}
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip" className="hidden-input"
                disabled={uploadingFile || !uploadTitle.trim()}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) { onUploadFile(uploadTitle.trim(), f); setUploadTitle(""); }
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          File upload available after saving the product. You can add URL links now.
        </p>
      )}
    </div>
  );
}

function extractYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    return u.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function resolveImageUrl(image) {
  if (!image) return null;
  const src = typeof image === "string" ? image : (image.thumbnail || image.url || "");
  if (!src) return null;
  if (src.startsWith("http")) return src;
  if (src.startsWith("/static")) return `${BACKEND_BASE}${src}`;
  return `${BACKEND_BASE}/static/migration/${src}`;
}

function ProductThumb({ images, size = 48 }) {
  const first = Array.isArray(images) ? images[0] : null;
  const url = resolveImageUrl(first);
  return url ? (
    <img
      src={url}
      alt=""
      style={{ width: size, height: size, objectFit: "cover", borderRadius: 6, display: "block", border: "1px solid var(--border)", flexShrink: 0 }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: 6, background: "#f3f4f6",
      border: "1px solid var(--border)", display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0, color: "#d1d5db", fontSize: 18
    }}>&#128247;</div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

const MISSING_FIELDS = ["sku", "brand", "categoryId", "hsnCode"];

function isMissing(product, field) {
  if (field === "categoryId") return !product.categoryId;
  return !product[field];
}

function isIncomplete(product) {
  return MISSING_FIELDS.some((f) => isMissing(product, f));
}

function categoryNameById(map, categoryId) {
  if (!categoryId) return "—";
  return map.get(categoryId)?.name || "Unknown";
}

function parseBulkPriceSlabs(text) {
  if (!text?.trim()) return [];
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [minQtyRaw, unitPriceRaw] = part.split(":").map((v) => v.trim());
      const minQty = Number(minQtyRaw);
      const unitPrice = Number(unitPriceRaw);
      if (!Number.isInteger(minQty) || minQty < 1 || Number.isNaN(unitPrice))
        throw new Error("Invalid bulk slab format. Use minQty:unitPrice, e.g. 10:2450, 25:2300");
      return { minQty, unitPrice };
    });
}

function bulkPriceSlabsToText(slabs) {
  if (!Array.isArray(slabs) || slabs.length === 0) return "";
  return slabs.map((s) => `${s.minQty}:${s.unitPrice}`).join(", ");
}

function parseStructuredPrices(text, keyName) {
  if (!text?.trim()) return [];
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [keyRaw, unitPriceRaw] = part.split(":").map((v) => v.trim());
      const unitPrice = Number(unitPriceRaw);
      if (!keyRaw || Number.isNaN(unitPrice) || unitPrice < 0)
        throw new Error(`Invalid ${keyName} format.`);
      return { [keyName]: keyRaw, unitPrice };
    });
}

function structuredPricesToText(rows, keyName) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  return rows.map((r) => `${r[keyName]}:${r.unitPrice}`).join(", ");
}

const EMPTY_FORM = {
  title: "", slug: "", oldUrl: "", categoryId: "", subcategoryId: "",
  brand: "", modelNumber: "", hsnCode: "",
  basePrice: "", salePrice: "", shortDescription: "", fullDescription: "",
  specificationsText: "{}", technicalKeywordsText: "", customerKeywordsText: "",
  useCasesText: "", problemStatementsText: "", moq: 1,
  bulkPricingEnabled: false, bulkPriceSlabsText: "", priceGroupPricesText: "",
  customerSpecificPricesText: "", quoteRequiredAboveQty: "", deadWeightKg: 0,
  lengthCm: "", widthCm: "", heightCm: "", shippingClass: "normal",
  videos: [], downloads: [],
  metaTitle: "", metaDescription: "", metaKeywords: "",
  googleShoppingTitle: "", googleShoppingDescription: "", googleProductCategory: "",
  productType: "", relationsRelated: [], relationsAccessory: [],
  isActive: true, stockQty: 0, reservedQty: 0,
  stockStatus: "in_stock", allowBackorder: false, maxOrderQty: 1000, lowStockThreshold: 0
};

function formFromProduct(product) {
  return {
    title: product.title || "", slug: product.slug || "", oldUrl: product.oldUrl || "",
    categoryId: product.categoryId || "", subcategoryId: product.subcategoryId || "",
    brand: product.brand || "", modelNumber: product.modelNumber || "",
    hsnCode: product.hsnCode || "",
    basePrice: product.basePrice ?? "", salePrice: product.salePrice ?? "",
    shortDescription: product.shortDescription || "", fullDescription: product.fullDescription || "",
    specificationsText: JSON.stringify(product.specifications || {}, null, 2),
    technicalKeywordsText: toCsvInput(product.technicalKeywords),
    customerKeywordsText: toCsvInput(product.customerKeywords),
    useCasesText: toCsvInput(product.useCases),
    problemStatementsText: toCsvInput(product.problemStatements),
    moq: Number(product.moq || 1), bulkPricingEnabled: Boolean(product.bulkPricingEnabled),
    bulkPriceSlabsText: bulkPriceSlabsToText(product.bulkPriceSlabs),
    priceGroupPricesText: structuredPricesToText(product.priceGroupPrices, "priceGroup"),
    customerSpecificPricesText: structuredPricesToText(product.customerSpecificPrices, "customerId"),
    quoteRequiredAboveQty:
      product.quoteRequiredAboveQty == null ? "" : Number(product.quoteRequiredAboveQty),
    deadWeightKg: Number(product.deadWeightKg || 0),
    lengthCm: product.lengthCm ?? "", widthCm: product.widthCm ?? "", heightCm: product.heightCm ?? "",
    shippingClass: product.shippingClass || "normal",
    videos: Array.isArray(product.videos) && product.videos.length
      ? product.videos.map(v => ({ url: v.url || "", label: v.label || "" }))
      : product.youtubeUrl ? [{ url: product.youtubeUrl, label: "" }] : [],
    downloads: Array.isArray(product.downloads)
      ? product.downloads.map(d => ({ title: d.title || "", url: d.url || "" }))
      : [],
    metaTitle: product.metaTitle || "",
    metaDescription: product.metaDescription || "",
    metaKeywords: product.metaKeywords || "",
    googleShoppingTitle: product.googleShoppingTitle || "",
    googleShoppingDescription: product.googleShoppingDescription || "",
    googleProductCategory: product.googleProductCategory || "",
    productType: product.productType || "",
    relationsRelated: Array.isArray(product.relations?.related) ? product.relations.related : [],
    relationsAccessory: Array.isArray(product.relations?.accessory) ? product.relations.accessory : [],
    isActive: Boolean(product.isActive),
    stockQty: Number(product.stockQty || 0), reservedQty: Number(product.reservedQty || 0),
    stockStatus: product.stockStatus || "in_stock", allowBackorder: Boolean(product.allowBackorder),
    maxOrderQty: Number(product.maxOrderQty || 1000), lowStockThreshold: Number(product.lowStockThreshold || 0)
  };
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function autoGenerateSeo(form) {
  const title = (form.title || "").trim();
  const brand = (form.brand || "").trim();
  const rawDesc = stripHtml(form.shortDescription || form.fullDescription || "");
  const stopWords = new Set(["and", "the", "for", "with", "this", "that", "are", "from", "into", "over", "under"]);

  const metaTitle = `${title}${brand ? ` | ${brand}` : ""}`.slice(0, 60);
  const metaDescription = rawDesc.slice(0, 155);

  const words = new Set();
  title.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)).forEach(w => words.add(w));
  if (brand) words.add(brand.toLowerCase());
  rawDesc.toLowerCase().split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w)).slice(0, 30).forEach(w => words.add(w));
  (form.technicalKeywordsText || "").split(",").map(w => w.trim().toLowerCase()).filter(Boolean).forEach(w => words.add(w));
  (form.customerKeywordsText || "").split(",").map(w => w.trim().toLowerCase()).filter(Boolean).forEach(w => words.add(w));
  const metaKeywords = [...words].slice(0, 20).join(", ");

  const googleShoppingTitle = form.googleShoppingTitle || `${title}${brand ? ` - ${brand}` : ""}`.slice(0, 150);
  const googleShoppingDescription = form.googleShoppingDescription || rawDesc.slice(0, 500);

  return { metaTitle, metaDescription, metaKeywords, googleShoppingTitle, googleShoppingDescription };
}

function buildPayload(form) {
  let specifications = {};
  if (form.specificationsText.trim()) specifications = JSON.parse(form.specificationsText);
  return {
    title: form.title, slug: form.slug.trim() || undefined, oldUrl: form.oldUrl,
    categoryId: form.categoryId || null, subcategoryId: form.subcategoryId || null,
    brand: form.brand, modelNumber: form.modelNumber,
    hsnCode: form.hsnCode, basePrice: Number(form.basePrice),
    salePrice: form.salePrice === "" ? undefined : Number(form.salePrice),
    shortDescription: form.shortDescription, fullDescription: form.fullDescription,
    specifications, technicalKeywords: splitCsvInput(form.technicalKeywordsText),
    customerKeywords: splitCsvInput(form.customerKeywordsText),
    useCases: splitCsvInput(form.useCasesText),
    problemStatements: splitCsvInput(form.problemStatementsText),
    moq: Number(form.moq || 1), bulkPricingEnabled: Boolean(form.bulkPricingEnabled),
    bulkPriceSlabs: parseBulkPriceSlabs(form.bulkPriceSlabsText),
    priceGroupPrices: parseStructuredPrices(form.priceGroupPricesText, "priceGroup"),
    customerSpecificPrices: parseStructuredPrices(form.customerSpecificPricesText, "customerId"),
    quoteRequiredAboveQty:
      form.quoteRequiredAboveQty === "" || form.quoteRequiredAboveQty === null
        ? null : Number(form.quoteRequiredAboveQty),
    deadWeightKg: Number(form.deadWeightKg || 0),
    lengthCm: form.lengthCm === "" ? null : Number(form.lengthCm),
    widthCm: form.widthCm === "" ? null : Number(form.widthCm),
    heightCm: form.heightCm === "" ? null : Number(form.heightCm),
    shippingClass: form.shippingClass,
    videos: (form.videos || []).filter(v => v.url.trim()),
    downloads: (form.downloads || []).filter(d => d.title.trim() && d.url.trim()),
    metaTitle: form.metaTitle || "",
    metaDescription: form.metaDescription || "",
    metaKeywords: form.metaKeywords || "",
    googleShoppingTitle: form.googleShoppingTitle,
    googleShoppingDescription: form.googleShoppingDescription,
    googleProductCategory: form.googleProductCategory, productType: form.productType,
    relations: { related: form.relationsRelated || [], accessory: form.relationsAccessory || [] },
    isActive: Boolean(form.isActive), stockQty: Number(form.stockQty || 0),
    reservedQty: Number(form.reservedQty || 0), stockStatus: form.stockStatus,
    allowBackorder: Boolean(form.allowBackorder),
    maxOrderQty: Number(form.maxOrderQty || 1000),
    lowStockThreshold: Number(form.lowStockThreshold || 0)
  };
}

function stockSummary(product) {
  const available = Number(product.availableQty || 0);
  const reserved = Number(product.reservedQty || 0);
  return `${available} avail / ${reserved} rsv`;
}

// ── Product relation chip picker ──────────────────────────────────────────────

function ProductRelationPicker({ label, ids, setIds, allProducts, currentId }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  const selected = (ids || [])
    .map((id) => allProducts.find((p) => p.id === id))
    .filter(Boolean);

  const matches = query.trim().length >= 1
    ? allProducts.filter((p) => {
        if (p.id === currentId) return false;
        if ((ids || []).includes(p.id)) return false;
        const q = query.toLowerCase();
        return (
          (p.title || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q) ||
          (p.modelNumber || "").toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  const add = (p) => {
    setIds((cur) => (cur.includes(p.id) ? cur : [...cur, p.id]));
    setQuery("");
    inputRef.current?.focus();
  };

  const remove = (id) => setIds((cur) => cur.filter((x) => x !== id));

  return (
    <div className="field field-full" style={{ position: "relative" }}>
      <span style={{ fontWeight: 500, fontSize: 13, color: "var(--text)", marginBottom: 4, display: "block" }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 36, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 8, background: "#fff", cursor: "text" }} onClick={() => inputRef.current?.focus()}>
        {selected.map((p) => (
          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(232,35,26,0.08)", color: "var(--brand)", border: "1px solid rgba(232,35,26,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
            {p.title}{p.sku ? ` (${p.sku})` : ""}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(p.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--brand)", fontWeight: 700, fontSize: 14 }}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={selected.length === 0 ? "Type product name or SKU…" : ""}
          style={{ border: "none", outline: "none", flex: 1, minWidth: 140, fontSize: 13, padding: "2px 0", background: "transparent" }}
        />
      </div>
      {matches.length > 0 && (
        <div style={{ position: "absolute", zIndex: 200, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", marginTop: 2, overflow: "hidden" }}>
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => add(p)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border-light)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <strong>{p.title}</strong>
              {p.sku ? <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11 }}>{p.sku}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline cell component ─────────────────────────────────────────────────────

function EditableCell({ rowId, field, value, type, options, missing, pending, activeCell, setActiveCell, onChange }) {
  const inputRef = useRef(null);
  const isActive = activeCell?.rowId === rowId && activeCell?.field === field;

  useEffect(() => {
    if (isActive && inputRef.current) inputRef.current.focus();
  }, [isActive]);

  const bg = pending ? "#dbeafe" : missing ? "#fef3c7" : "transparent";
  const border = pending ? "1px solid #93c5fd" : missing ? "1px solid #fcd34d" : "none";

  if (isActive) {
    if (type === "select") {
      return (
        <td style={{ padding: "4px 6px" }}>
          <select
            ref={inputRef}
            style={{ width: "100%", fontSize: 12, padding: "3px 4px", borderRadius: 4 }}
            value={value ?? ""}
            onChange={(e) => onChange(rowId, field, e.target.value)}
            onBlur={() => setActiveCell(null)}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </td>
      );
    }
    return (
      <td style={{ padding: "4px 6px" }}>
        <input
          ref={inputRef}
          type={type || "text"}
          style={{ width: "100%", fontSize: 12, padding: "3px 4px", borderRadius: 4 }}
          value={value ?? ""}
          onChange={(e) => onChange(rowId, field, e.target.value)}
          onBlur={() => setActiveCell(null)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); setActiveCell(null); } }}
        />
      </td>
    );
  }

  const display =
    type === "select"
      ? (options?.find((o) => o.value === value)?.label || (value ? value : "—"))
      : (value !== undefined && value !== null && value !== "" ? value : "—");

  return (
    <td
      style={{ background: bg, border, padding: "6px 8px", cursor: "text", fontSize: 12, whiteSpace: "nowrap" }}
      onClick={() => setActiveCell({ rowId, field })}
      title={missing ? "Missing — click to fill" : "Click to edit"}
    >
      {display}
    </td>
  );
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: disabled ? "default" : "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
      />
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? "#E8231A" : "#d1d5db",
        transition: "background 0.2s", position: "relative", flexShrink: 0
      }}>
        <div style={{
          position: "absolute", top: 3,
          left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
        }} />
      </div>
    </label>
  );
}

// ── StockDot ──────────────────────────────────────────────────────────────────

function StockDot({ status, availableQty }) {
  const config = {
    in_stock:     { color: "#22c55e", label: "In Stock" },
    low_stock:    { color: "#f59e0b", label: availableQty != null ? `Low Stock (${availableQty})` : "Low Stock" },
    out_of_stock: { color: "#ef4444", label: "Out of Stock" },
    backorder:    { color: "#6366f1", label: "Backorder" }
  };
  const c = config[status] || config.in_stock;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: c.color }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

// ── ListPriceCell — two editable price inputs (Sale + MRP) in one table cell ──

function ListPriceCell({ rowId, salePrice, basePrice, pendingSale, pendingBase, activeCell, setActiveCell, onChange }) {
  const saleRef = useRef(null);
  const baseRef = useRef(null);
  const isSaleActive = activeCell?.rowId === rowId && activeCell?.field === "salePrice";
  const isBaseActive = activeCell?.rowId === rowId && activeCell?.field === "basePrice";

  useEffect(() => { if (isSaleActive && saleRef.current) saleRef.current.focus(); }, [isSaleActive]);
  useEffect(() => { if (isBaseActive && baseRef.current) baseRef.current.focus(); }, [isBaseActive]);

  const inputStyle = (pending) => ({
    width: 70, fontSize: 12, padding: "3px 5px", borderRadius: 4,
    border: pending ? "1px solid #93c5fd" : "1px solid #e5e7eb",
    background: pending ? "#dbeafe" : "#fff"
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, color: "#9ca3af", minWidth: 30 }}>Sale</span>
        {isSaleActive ? (
          <input ref={saleRef} type="number" style={inputStyle(pendingSale)} value={salePrice ?? ""}
            onChange={(e) => onChange(rowId, "salePrice", e.target.value)}
            onBlur={() => setActiveCell(null)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); setActiveCell(null); } }}
          />
        ) : (
          <span
            style={{ ...inputStyle(pendingSale), cursor: "text", display: "inline-block", minHeight: 22, lineHeight: "22px", color: "#E8231A", fontWeight: 700 }}
            onClick={() => setActiveCell({ rowId, field: "salePrice" })}
            title="Click to edit sale price"
          >
            {salePrice != null && salePrice !== "" ? `₹${salePrice}` : "—"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, color: "#9ca3af", minWidth: 30 }}>MRP</span>
        {isBaseActive ? (
          <input ref={baseRef} type="number" style={inputStyle(pendingBase)} value={basePrice ?? ""}
            onChange={(e) => onChange(rowId, "basePrice", e.target.value)}
            onBlur={() => setActiveCell(null)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); setActiveCell(null); } }}
          />
        ) : (
          <span
            style={{ ...inputStyle(pendingBase), cursor: "text", display: "inline-block", minHeight: 22, lineHeight: "22px", color: "#9ca3af", textDecoration: "line-through" }}
            onClick={() => setActiveCell({ rowId, field: "basePrice" })}
            title="Click to edit MRP"
          >
            {basePrice != null && basePrice !== "" ? `₹${basePrice}` : "—"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "products.create");
  const canEdit = hasPermission(session, "products.edit");
  const canDelete = hasPermission(session, "products.delete");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hsnRecords, setHsnRecords] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ q: "", categoryId: "", includeInactive: true });

  // list-view state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [uploadingProductId, setUploadingProductId] = useState("");
  const [uploadingModalImage, setUploadingModalImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  // Images queued before a new product is saved: [{file, previewUrl}]
  const [pendingImages, setPendingImages] = useState([]);
  const modalImageRef = useRef(null);
  const modalVideoRef = useRef(null);
  const modalDocRef = useRef(null);

  // inline-create for HSN / Category / Subcategory
  const [inlineCreate, setInlineCreate] = useState(null); // null | "hsn" | "category" | "subcategory"
  const [inlineForm, setInlineForm] = useState({});
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineError, setInlineError] = useState("");

  // view mode
  const [viewMode, setViewMode] = useState("list"); // "list" | "bulk-edit"

  // bulk-edit state
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [pendingEdits, setPendingEdits] = useState({}); // { [productId]: { field: value } }
  const [activeCell, setActiveCell] = useState(null);  // { rowId, field }
  const [bulkSaving, setBulkSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef(null);

  // list-view selection + display filters
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  // mass-action panel
  const [massAction, setMassAction] = useState(null); // null | "category" | "hsn" | "price" | "qty"
  const [massValue, setMassValue] = useState({ categoryId: "", hsnCode: "", priceMode: "pct_increase", priceAmount: "", qtyMode: "set", qtyAmount: "" });

  // column selector (persisted to localStorage via products-column-selector.jsx)
  const [visibleColumns, setVisibleColumns] = useState(() => loadSavedCols());

  // inline edits in list view (separate from bulk-edit pendingEdits)
  const [listPendingEdits, setListPendingEdits] = useState({});
  const [listActiveCell, setListActiveCell] = useState(null);
  const [listSaving, setListSaving] = useState(false);

  // pagination (bulk edit)
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const subcategoryOptions = useMemo(
    () => categories.filter((item) => item.parentCategoryId === form.categoryId),
    [categories, form.categoryId]
  );

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const hsnOptions = useMemo(
    () => hsnRecords.map((h) => ({
      value: h.hsnCode,
      label: `${h.hsnCode} – ${h.gstRate}% – ${h.description ? h.description.slice(0, 50) : ""}`
    })),
    [hsnRecords]
  );

  const pendingCount = useMemo(
    () => Object.values(pendingEdits).reduce((sum, obj) => sum + Object.keys(obj).length, 0),
    [pendingEdits]
  );

  const incompleteCount = useMemo(() => rows.filter(isIncomplete).length, [rows]);

  // ── data loading ────────────────────────────────────────────────────────────

  const loadProducts = async (nextFilters = filters) => {
    try {
      const data = await fetchProducts(nextFilters);
      setRows(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load products.");
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [productData, categoryData, hsnData] = await Promise.all([
        fetchProducts(filters),
        fetchCategories({ includeInactive: true, q: "" }),
        fetchHsnTaxRecords({ includeInactive: false, q: "" })
      ]);
      setRows(Array.isArray(productData) ? productData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setHsnRecords(Array.isArray(hsnData) ? hsnData : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { bootstrap(); }, []);

  // Pick up success notice from add-product-page navigation
  useEffect(() => {
    if (location.state?.notice) {
      setNotice(location.state.notice);
      window.history.replaceState({}, "");
    }
  }, []);

  // ── list view handlers ───────────────────────────────────────────────────────

  const onFilterSubmit = async (e) => { e.preventDefault(); await loadProducts(filters); };

  const clearPendingImages = (imgs = pendingImages) => {
    imgs.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPendingImages([]);
  };

  const openCreate = () => {
    navigate("/products/add");
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setEditingProduct(row);
    setForm(formFromProduct(row));
    setDocTitle("");
    clearPendingImages();
    setModalOpen(true);
  };

  const closeModal = () => {
    clearPendingImages();
    setInlineCreate(null);
    setInlineForm({});
    setInlineError("");
    setModalError("");
    setModalOpen(false);
    setSaving(false);
  };

  // ── inline create handlers ──────────────────────────────────────────────────

  const openInlineCreate = (type) => {
    const today = new Date().toISOString().slice(0, 10);
    const defaults = {
      category: { name: "" },
      subcategory: { name: "" },
      hsn: { hsnCode: "", gstRate: "18", description: "", effectiveFrom: today }
    };
    setInlineCreate(type);
    setInlineForm(defaults[type] || {});
    setInlineError("");
  };

  const cancelInlineCreate = () => {
    setInlineCreate(null);
    setInlineForm({});
    setInlineError("");
  };

  const onInlineFormChange = (field, value) => {
    setInlineForm((cur) => ({ ...cur, [field]: value }));
  };

  const submitInlineCreate = async () => {
    setInlineSaving(true);
    setInlineError("");
    try {
      if (inlineCreate === "category") {
        const result = await createCategory({ name: (inlineForm.name || "").trim() });
        const newId = result?.id || result?.data?.id;
        const freshCats = await fetchCategories({ includeInactive: true, q: "" });
        setCategories(Array.isArray(freshCats) ? freshCats : []);
        if (newId) setForm((cur) => ({ ...cur, categoryId: newId, subcategoryId: "" }));
      } else if (inlineCreate === "subcategory") {
        const result = await createCategory({
          name: (inlineForm.name || "").trim(),
          parentCategoryId: form.categoryId || null
        });
        const newId = result?.id || result?.data?.id;
        const freshCats = await fetchCategories({ includeInactive: true, q: "" });
        setCategories(Array.isArray(freshCats) ? freshCats : []);
        if (newId) setForm((cur) => ({ ...cur, subcategoryId: newId }));
      } else if (inlineCreate === "hsn") {
        const code = (inlineForm.hsnCode || "").trim();
        await createHsnTaxRecord({
          hsnCode: code,
          description: (inlineForm.description || "").trim(),
          gstRate: Number(inlineForm.gstRate || 18),
          effectiveFrom: inlineForm.effectiveFrom || new Date().toISOString().slice(0, 10)
        });
        const freshHsn = await fetchHsnTaxRecords({ includeInactive: false, q: "" });
        setHsnRecords(Array.isArray(freshHsn) ? freshHsn : []);
        setForm((cur) => ({ ...cur, hsnCode: code }));
      }
      cancelInlineCreate();
    } catch (err) {
      setInlineError(err?.message || "Failed to create. Check required fields.");
    } finally {
      setInlineSaving(false);
    }
  };

  const onFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((cur) => ({ ...cur, [name]: type === "checkbox" ? checked : value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice(""); setModalError("");
    try {
      const payload = buildPayload(form);
      if (editingId) {
        await updateProduct(editingId, payload);
        setNotice("Product updated.");
      } else {
        const created = await createProduct(payload);
        const newId = created?.id || created?.data?.id;
        // Upload any queued images now that we have a product ID
        if (newId && pendingImages.length > 0) {
          for (const { file } of pendingImages) {
            try { await uploadProductImage(newId, file); } catch { /* skip failed images */ }
          }
          clearPendingImages();
        }
        setNotice(`Product created${pendingImages.length > 0 ? " with images" : ""}.`);
      }
      closeModal();
      await loadProducts(filters);
    } catch (apiError) {
      const msg = apiError.message || "Failed to save product.";
      setModalError(msg);
      // Auto-focus the field mentioned in the error
      const lower = msg.toLowerCase();
      const fieldMap = [
        ["title", "title"], ["slug", "slug"], ["sku", "sku"],
        ["hsn", "hsnCode"], ["category", "categoryId"],
        ["base price", "basePrice"], ["price", "basePrice"],
        ["stock", "stockQty"], ["weight", "deadWeightKg"],
        ["moq", "moq"], ["brand", "brand"], ["model", "modelNumber"]
      ];
      for (const [keyword, name] of fieldMap) {
        if (lower.includes(keyword)) {
          const el = document.querySelector(`[data-modal-form] [name="${name}"]`);
          if (el) { el.focus(); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
          break;
        }
      }
    } finally { setSaving(false); }
  };

  const onArchive = async (row) => {
    if (!window.confirm(`Archive "${row.title}"?`)) return;
    try {
      await archiveProduct(row.id);
      setNotice(`Archived: ${row.title}`);
      await loadProducts(filters);
    } catch (apiError) { setError(apiError.message || "Failed to archive."); }
  };

  const onUploadImage = async (productId, file) => {
    if (!file) return;
    setUploadingProductId(productId); setError(""); setNotice("");
    try {
      const res = await uploadProductImage(productId, file);
      setNotice(`Image uploaded: ${res.imageUrl}`);
      await loadProducts(filters);
    } catch (apiError) { setError(apiError.message || "Image upload failed.");
    } finally { setUploadingProductId(""); }
  };

  const onAddPendingImage = (files) => {
    if (!files?.length) return;
    const newEntries = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name
    }));
    setPendingImages((cur) => [...cur, ...newEntries]);
  };

  const onRemovePendingImage = (idx) => {
    setPendingImages((cur) => {
      URL.revokeObjectURL(cur[idx].previewUrl);
      return cur.filter((_, i) => i !== idx);
    });
  };

  const onUploadModalImage = async (file) => {
    if (!file || !editingId) return;
    setUploadingModalImage(true); setError(""); setNotice("");
    try {
      await uploadProductImage(editingId, file);
      const updated = await fetchProducts(filters);
      const fresh = (Array.isArray(updated) ? updated : []).find(r => r.id === editingId);
      if (fresh) { setEditingProduct(fresh); setRows(Array.isArray(updated) ? updated : []); }
      setNotice("Image uploaded.");
    } catch (apiError) { setError(apiError.message || "Image upload failed."); }
    finally { setUploadingModalImage(false); }
  };

  const onDeleteModalImage = async (imgUrl) => {
    if (!editingId || !window.confirm("Remove this image?")) return;
    setError(""); setNotice("");
    try {
      await deleteProductImage(editingId, imgUrl);
      const updated = await fetchProducts(filters);
      const fresh = (Array.isArray(updated) ? updated : []).find(r => r.id === editingId);
      if (fresh) { setEditingProduct(fresh); setRows(Array.isArray(updated) ? updated : []); }
      setNotice("Image removed.");
    } catch (apiError) { setError(apiError.message || "Failed to remove image."); }
  };

  const onUploadModalVideo = async (file) => {
    if (!file || !editingId) return;
    setUploadingVideo(true); setError(""); setNotice("");
    try {
      await uploadProductVideo(editingId, file);
      const updated = await fetchProducts(filters);
      const fresh = (Array.isArray(updated) ? updated : []).find(r => r.id === editingId);
      if (fresh) { setEditingProduct(fresh); setRows(Array.isArray(updated) ? updated : []); }
      setNotice("Video uploaded.");
    } catch (apiError) { setError(apiError.message || "Video upload failed."); }
    finally { setUploadingVideo(false); }
  };

  const onUploadModalDocument = async (title, file) => {
    if (!file || !editingId) return;
    setUploadingDocument(true); setError(""); setNotice("");
    try {
      await uploadProductDocument(editingId, title, file);
      const updated = await fetchProducts(filters);
      const fresh = (Array.isArray(updated) ? updated : []).find(r => r.id === editingId);
      if (fresh) {
        setEditingProduct(fresh);
        setRows(Array.isArray(updated) ? updated : []);
        // Sync form.downloads so the main save doesn't lose the uploaded file
        setForm(cur => ({ ...cur, downloads: Array.isArray(fresh.downloads) ? fresh.downloads.map(d => ({ title: d.title || "", url: d.url || "" })) : cur.downloads }));
      }
      setDocTitle(""); setNotice("Document uploaded.");
    } catch (apiError) { setError(apiError.message || "Document upload failed."); }
    finally { setUploadingDocument(false); }
  };

  const onAutoGenerateSeo = () => {
    const generated = autoGenerateSeo(form);
    setForm(cur => ({ ...cur, ...generated }));
    setNotice("SEO fields auto-generated. Review and adjust before saving.");
  };

  // ── import handler ───────────────────────────────────────────────────────────

  const onImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setError(""); setNotice("");
    try {
      // Send as multipart file upload — bypasses Express JSON body size limit
      const result = await importProductsFile(file);
      setNotice(`Import complete: ${result.imported} imported, ${result.skipped} already existed.`);
      await loadProducts(filters);
      setViewMode("bulk-edit");
      setIncompleteOnly(true);
    } catch (apiError) {
      setError(apiError.message || "Import failed.");
    } finally { setImporting(false); }
  };

  // ── column selector + list-view inline edit handlers ─────────────────────────

  const onColumnsChange = (newSet) => {
    setVisibleColumns(newSet);
    saveCols(newSet);
  };

  const setListCellValue = (productId, field, value) => {
    setListPendingEdits((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), [field]: value }
    }));
  };

  const getListVal = (productId, field, original) => {
    if (listPendingEdits[productId]?.[field] !== undefined) return listPendingEdits[productId][field];
    return original;
  };

  const onListSave = async () => {
    setListSaving(true);
    setError(""); setNotice("");
    try {
      const updates = Object.entries(listPendingEdits).map(([id, fields]) => ({ id, ...fields }));
      const result = await bulkPatchProducts(updates);
      const errMsg = result.errors?.length ? ` ${result.errors.length} error(s).` : "";
      setNotice(`Saved ${result.updated} product${result.updated !== 1 ? "s" : ""}.${errMsg}`);
      setListPendingEdits({});
      await loadProducts(filters);
    } catch (apiError) {
      setError(apiError.message || "Save failed.");
    } finally { setListSaving(false); }
  };

  const onListDiscard = () => {
    if (Object.keys(listPendingEdits).length && window.confirm("Discard all unsaved changes?")) {
      setListPendingEdits({});
    }
  };

  const onShareProduct = (row) => {
    const url = `${STOREFRONT_URL}/products/${row.slug}`;
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => setNotice(`Copied: ${url}`))
        .catch(() => window.open(url, "_blank", "noopener"));
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  // ── bulk-edit handlers ────────────────────────────────────────────────────────

  const setCellValue = (productId, field, value) => {
    setPendingEdits((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), [field]: value }
    }));
  };

  const getVal = (productId, field, original) => {
    if (pendingEdits[productId]?.[field] !== undefined) return pendingEdits[productId][field];
    return original;
  };

  const onBulkSave = async () => {
    setBulkSaving(true);
    setError(""); setNotice("");
    try {
      const updates = Object.entries(pendingEdits).map(([id, fields]) => ({ id, ...fields }));
      const result = await bulkPatchProducts(updates);
      const errMsg = result.errors?.length ? ` ${result.errors.length} error(s).` : "";
      setNotice(`Saved ${result.updated} products.${errMsg}`);
      setPendingEdits({});
      await loadProducts(filters);
    } catch (apiError) {
      setError(apiError.message || "Bulk save failed.");
    } finally { setBulkSaving(false); }
  };

  const onDiscardEdits = () => { if (window.confirm("Discard all unsaved changes?")) setPendingEdits({}); };

  const onToggleActive = async (row, newIsActive) => {
    try {
      await bulkPatchProducts([{ id: row.id, isActive: newIsActive }]);
      await loadProducts(filters);
    } catch (err) { setError(err.message || "Toggle failed."); }
  };

  const openClone = (row) => {
    setEditingId(null);
    setEditingProduct(null);
    const cloneForm = formFromProduct(row);
    cloneForm.title = `Copy of ${row.title}`;
    cloneForm.slug = "";
    cloneForm.sku = "";
    clearPendingImages();
    setDocTitle("");
    setModalOpen(true);
    setForm(cloneForm);
  };

  const onBulkActivate = async (activate) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      await bulkPatchProducts(ids.map((id) => ({ id, isActive: activate })));
      setSelectedIds(new Set());
      setMassAction(null);
      setNotice(`${ids.length} products ${activate ? "activated" : "deactivated"}.`);
      await loadProducts(filters);
    } catch (err) { setError(err.message || "Bulk action failed."); }
  };

  const onBulkArchiveSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !window.confirm(`Archive ${ids.length} product${ids.length !== 1 ? "s" : ""}?`)) return;
    try {
      for (const id of ids) await archiveProduct(id);
      setSelectedIds(new Set());
      setNotice(`${ids.length} products archived.`);
      await loadProducts(filters);
    } catch (err) { setError(err.message || "Bulk archive failed."); }
  };

  const onApplyMassCategory = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !massValue.categoryId) return;
    try {
      const result = await bulkPatchProducts(ids.map((id) => ({ id, categoryId: massValue.categoryId })));
      setSelectedIds(new Set());
      setMassAction(null);
      setNotice(`Category updated on ${result.updated} product${result.updated !== 1 ? "s" : ""}.`);
      await loadProducts(filters);
    } catch (err) { setError(err.message || "Bulk category update failed."); }
  };

  const onApplyMassHsn = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !massValue.hsnCode) return;
    try {
      const result = await bulkPatchProducts(ids.map((id) => ({ id, hsnCode: massValue.hsnCode })));
      setSelectedIds(new Set());
      setMassAction(null);
      setNotice(`HSN code updated on ${result.updated} product${result.updated !== 1 ? "s" : ""}.${result.errors?.length ? ` ${result.errors.length} skipped.` : ""}`);
      await loadProducts(filters);
    } catch (err) { setError(err.message || "Bulk HSN update failed."); }
  };

  const onApplyMassPrice = async () => {
    const ids = [...selectedIds];
    const amt = parseFloat(massValue.priceAmount);
    if (!ids.length || isNaN(amt) || amt <= 0) return;
    const updates = ids.map((id) => {
      const product = rows.find((r) => r.id === id);
      const base = Number(product?.salePrice || product?.basePrice || 0);
      let nextPrice = base;
      if (massValue.priceMode === "pct_increase") nextPrice = Math.round(base * (1 + amt / 100));
      else if (massValue.priceMode === "pct_decrease") nextPrice = Math.round(base * (1 - amt / 100));
      else if (massValue.priceMode === "set") nextPrice = amt;
      return { id, salePrice: Math.max(0, nextPrice) };
    });
    try {
      const result = await bulkPatchProducts(updates);
      setSelectedIds(new Set());
      setMassAction(null);
      setNotice(`Price updated on ${result.updated} product${result.updated !== 1 ? "s" : ""}.`);
      await loadProducts(filters);
    } catch (err) { setError(err.message || "Bulk price update failed."); }
  };

  const onApplyMassQty = async () => {
    const ids = [...selectedIds];
    const amt = parseInt(massValue.qtyAmount, 10);
    if (!ids.length || isNaN(amt)) return;
    const updates = ids.map((id) => {
      const product = rows.find((r) => r.id === id);
      const current = Number(product?.stockQty || 0);
      let nextQty = amt;
      if (massValue.qtyMode === "add") nextQty = current + amt;
      else if (massValue.qtyMode === "subtract") nextQty = Math.max(0, current - amt);
      return { id, stockQty: Math.max(0, nextQty) };
    });
    try {
      const result = await bulkPatchProducts(updates);
      setSelectedIds(new Set());
      setMassAction(null);
      setNotice(`Qty updated on ${result.updated} product${result.updated !== 1 ? "s" : ""}.`);
      await loadProducts(filters);
    } catch (err) { setError(err.message || "Bulk qty update failed."); }
  };

  // ── bulk-edit display rows ────────────────────────────────────────────────────

  const bulkRows = useMemo(() => {
    let display = [...rows];
    if (incompleteOnly) display = display.filter(isIncomplete);
    const q = filters.q.toLowerCase();
    if (q) display = display.filter((r) => `${r.title} ${r.sku} ${r.brand}`.toLowerCase().includes(q));
    return display;
  }, [rows, incompleteOnly, filters.q]);

  const displayRows = useMemo(() => {
    let result = rows;
    if (statusFilter === "active")   result = result.filter((r) => r.isActive);
    if (statusFilter === "inactive") result = result.filter((r) => !r.isActive);
    if (stockFilter !== "all")       result = result.filter((r) => r.stockStatus === stockFilter);
    return result;
  }, [rows, statusFilter, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(bulkRows.length / PAGE_SIZE));
  const pageRows = bulkRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── loading / error screens ───────────────────────────────────────────────────

  if (loading) return <LoadingBlock label="Loading products..." />;
  if (error && rows.length === 0) return <ErrorBlock message={error} onRetry={bootstrap} />;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <section className="stack">
      <PageHeader
        title="Products"
        description={
          viewMode === "bulk-edit"
            ? `Bulk Edit — ${incompleteCount} incomplete product${incompleteCount !== 1 ? "s" : ""}`
            : "Manage your product catalogue"
        }
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Import button */}
            <label
              className="btn btn-secondary btn-small"
              style={{ cursor: importing ? "wait" : "pointer", opacity: importing ? 0.6 : 1 }}
              title="Import from products_import.json"
            >
              {importing ? "Importing…" : "Import Migration JSON"}
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                className="hidden-input"
                disabled={importing}
                onChange={onImportFileChange}
              />
            </label>

            {/* View toggle */}
            <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <button
                type="button"
                style={{
                  padding: "6px 14px", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
                  background: viewMode === "list" ? "var(--brand)" : "var(--surface)",
                  color: viewMode === "list" ? "#fff" : "var(--text)"
                }}
                onClick={() => setViewMode("list")}
              >
                List
              </button>
              <button
                type="button"
                style={{
                  padding: "6px 14px", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
                  background: viewMode === "bulk-edit" ? "var(--brand)" : "var(--surface)",
                  color: viewMode === "bulk-edit" ? "#fff" : "var(--text)"
                }}
                onClick={() => setViewMode("bulk-edit")}
              >
                Bulk Edit {incompleteCount > 0 && (
                  <span style={{
                    background: "#ef4444", color: "#fff", borderRadius: 99,
                    padding: "1px 6px", fontSize: 11, marginLeft: 4
                  }}>{incompleteCount}</span>
                )}
              </button>
            </div>

            {/* Google Shopping export */}
            {viewMode === "list" && (
              <a
                href={getGoogleShoppingExportUrl(API_BASE_URL)}
                download="google-shopping-feed.tsv"
                className="btn btn-secondary btn-small"
                title="Download Google Shopping TSV feed"
              >
                Export Google Shopping
              </a>
            )}

            {/* Add product (list mode only) */}
            {viewMode === "list" && canCreate && (
              <button type="button" className="btn btn-primary btn-small" onClick={openCreate}>
                + Add Product
              </button>
            )}
          </div>
        }
      />

      {notice && <p className="alert-info">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <>
          {/* Category chips */}
          {categories.length > 0 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 2, scrollbarWidth: "none" }}>
              {[{ id: "", name: `All` }, ...categories].map((c) => {
                const active = filters.categoryId === c.id;
                return (
                  <button
                    key={c.id || "__all"}
                    type="button"
                    onClick={() => {
                      const next = { ...filters, categoryId: c.id };
                      setFilters(next);
                      setPage(1);
                      loadProducts(next);
                    }}
                    style={{
                      flexShrink: 0,
                      padding: "6px 14px",
                      borderRadius: 20,
                      border: active ? "none" : "1px solid #e5e7eb",
                      background: active ? "#E8231A" : "#fff",
                      color: active ? "#fff" : "#4b5563",
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      whiteSpace: "nowrap"
                    }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "#E8231A"; e.currentTarget.style.color = "#E8231A"; } }}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.color = "#4b5563"; } }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── filter bar ── */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: "12px 16px", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <form onSubmit={onFilterSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <div style={{ flex: "1 1 240px", position: "relative" }}>
                <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#9ca3af", pointerEvents: "none" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="search"
                  placeholder="Search title, SKU, model…"
                  value={filters.q}
                  onChange={(e) => setFilters((cur) => ({ ...cur, q: e.target.value }))}
                  style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 10, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", background: "#fff", outline: "none", cursor: "pointer" }}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                style={{ fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", background: "#fff", outline: "none", cursor: "pointer" }}
              >
                <option value="all">All Stock</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
              <button
                type="submit"
                style={{ fontSize: 13, fontWeight: 500, padding: "9px 16px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", cursor: "pointer", color: "#374151" }}
              >
                Apply
              </button>
              <a
                href={getGoogleShoppingExportUrl(API_BASE_URL)}
                download="google-shopping-feed.tsv"
                style={{ fontSize: 13, fontWeight: 500, padding: "9px 16px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, color: "#374151", textDecoration: "none" }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Export
              </a>
              <ProductsColumnSelector visibleColumns={visibleColumns} onChange={onColumnsChange} />
            </form>
          </div>

          {/* ── pending list-edit save bar ── */}
          {Object.keys(listPendingEdits).length > 0 && (
            <div style={{ background: "rgba(232,35,26,0.06)", border: "1px solid rgba(232,35,26,0.2)", borderRadius: 12, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#E8231A" }}>
                {Object.keys(listPendingEdits).length} product{Object.keys(listPendingEdits).length !== 1 ? "s" : ""} with unsaved changes
              </span>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button type="button" onClick={onListSave} disabled={listSaving}
                  style={{ fontSize: 12, background: "#E8231A", border: "none", color: "#fff", padding: "6px 16px", borderRadius: 8, cursor: listSaving ? "wait" : "pointer", fontWeight: 600 }}>
                  {listSaving ? "Saving…" : "Save Changes"}
                </button>
                <button type="button" onClick={onListDiscard}
                  style={{ fontSize: 12, background: "#fff", border: "1px solid #e5e7eb", color: "#9ca3af", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* ── bulk actions bar ── */}
          {selectedIds.size > 0 && (
            <div style={{ marginBottom: 12 }}>
              {/* top bar */}
              <div style={{ background: "rgba(232,35,26,0.06)", border: "1px solid rgba(232,35,26,0.2)", borderRadius: massAction ? "12px 12px 0 0" : 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#E8231A", marginRight: 4 }}>
                  {selectedIds.size} selected
                </span>
                {/* mass-action buttons */}
                {[
                  { key: "category", label: "Set Category" },
                  { key: "hsn",      label: "Set HSN" },
                  { key: "price",    label: "Adjust Price" },
                  { key: "qty",      label: "Set Qty" }
                ].map(({ key, label }) => (
                  <button key={key} type="button"
                    onClick={() => setMassAction(massAction === key ? null : key)}
                    style={{ fontSize: 12, background: massAction === key ? "#E8231A" : "#fff", border: "1px solid " + (massAction === key ? "#E8231A" : "#e5e7eb"), color: massAction === key ? "#fff" : "#374151", padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontWeight: massAction === key ? 700 : 400 }}>
                    {label}
                  </button>
                ))}
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <button type="button" onClick={() => onBulkActivate(true)}
                    style={{ fontSize: 12, background: "#fff", border: "1px solid #e5e7eb", color: "#374151", padding: "5px 10px", borderRadius: 8, cursor: "pointer" }}>
                    Activate
                  </button>
                  <button type="button" onClick={() => onBulkActivate(false)}
                    style={{ fontSize: 12, background: "#fff", border: "1px solid #e5e7eb", color: "#374151", padding: "5px 10px", borderRadius: 8, cursor: "pointer" }}>
                    Deactivate
                  </button>
                  <button type="button" onClick={onBulkArchiveSelected}
                    style={{ fontSize: 12, background: "#fff", border: "1px solid #fecaca", color: "#dc2626", padding: "5px 10px", borderRadius: 8, cursor: "pointer" }}>
                    Archive
                  </button>
                  <button type="button" onClick={() => { setSelectedIds(new Set()); setMassAction(null); }}
                    style={{ fontSize: 12, background: "none", border: "none", color: "#9ca3af", padding: "5px 8px", cursor: "pointer" }}>
                    ✕ Clear
                  </button>
                </div>
              </div>

              {/* expandable panel */}
              {massAction === "category" && (
                <div style={{ background: "#fff", border: "1px solid rgba(232,35,26,0.2)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Category</label>
                  <select
                    value={massValue.categoryId}
                    onChange={(e) => setMassValue((v) => ({ ...v, categoryId: e.target.value }))}
                    style={{ flex: "1 1 220px", padding: "6px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8, minWidth: 180 }}>
                    <option value="">— pick a category —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" onClick={onApplyMassCategory} disabled={!massValue.categoryId}
                    style={{ fontSize: 13, fontWeight: 700, background: "#E8231A", color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, cursor: "pointer", opacity: massValue.categoryId ? 1 : 0.45 }}>
                    Apply to {selectedIds.size} products
                  </button>
                </div>
              )}

              {massAction === "hsn" && (
                <div style={{ background: "#fff", border: "1px solid rgba(232,35,26,0.2)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>HSN Code</label>
                  <select
                    value={massValue.hsnCode}
                    onChange={(e) => setMassValue((v) => ({ ...v, hsnCode: e.target.value }))}
                    style={{ flex: "1 1 260px", padding: "6px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8, minWidth: 200 }}>
                    <option value="">— pick an HSN code —</option>
                    {hsnRecords.map((h) => <option key={h.id} value={h.hsnCode}>{h.hsnCode} — {h.description || ""} ({h.gstRate}% GST)</option>)}
                  </select>
                  <button type="button" onClick={onApplyMassHsn} disabled={!massValue.hsnCode}
                    style={{ fontSize: 13, fontWeight: 700, background: "#E8231A", color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, cursor: "pointer", opacity: massValue.hsnCode ? 1 : 0.45 }}>
                    Apply to {selectedIds.size} products
                  </button>
                </div>
              )}

              {massAction === "price" && (
                <div style={{ background: "#fff", border: "1px solid rgba(232,35,26,0.2)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Price</label>
                  <select
                    value={massValue.priceMode}
                    onChange={(e) => setMassValue((v) => ({ ...v, priceMode: e.target.value }))}
                    style={{ padding: "6px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                    <option value="pct_increase">Increase by %</option>
                    <option value="pct_decrease">Decrease by %</option>
                    <option value="set">Set fixed price (₹)</option>
                  </select>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder={massValue.priceMode === "set" ? "Price (₹)" : "Percentage (%)"}
                    value={massValue.priceAmount}
                    onChange={(e) => setMassValue((v) => ({ ...v, priceAmount: e.target.value }))}
                    style={{ width: 130, padding: "6px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8 }}
                  />
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    {massValue.priceMode === "pct_increase" && massValue.priceAmount ? `e.g. ₹1000 → ₹${Math.round(1000 * (1 + Number(massValue.priceAmount) / 100))}` : ""}
                    {massValue.priceMode === "pct_decrease" && massValue.priceAmount ? `e.g. ₹1000 → ₹${Math.round(1000 * (1 - Number(massValue.priceAmount) / 100))}` : ""}
                    {massValue.priceMode === "set" && massValue.priceAmount ? `All selected products set to ₹${massValue.priceAmount}` : ""}
                  </span>
                  <button type="button" onClick={onApplyMassPrice} disabled={!massValue.priceAmount}
                    style={{ fontSize: 13, fontWeight: 700, background: "#E8231A", color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, cursor: "pointer", opacity: massValue.priceAmount ? 1 : 0.45 }}>
                    Apply to {selectedIds.size} products
                  </button>
                </div>
              )}

              {massAction === "qty" && (
                <div style={{ background: "#fff", border: "1px solid rgba(232,35,26,0.2)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Stock Qty</label>
                  <select
                    value={massValue.qtyMode}
                    onChange={(e) => setMassValue((v) => ({ ...v, qtyMode: e.target.value }))}
                    style={{ padding: "6px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                    <option value="set">Set to exact value</option>
                    <option value="add">Add to current qty</option>
                    <option value="subtract">Subtract from current qty</option>
                  </select>
                  <input
                    type="number" min="0" step="1"
                    placeholder="Quantity"
                    value={massValue.qtyAmount}
                    onChange={(e) => setMassValue((v) => ({ ...v, qtyAmount: e.target.value }))}
                    style={{ width: 110, padding: "6px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8 }}
                  />
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    {massValue.qtyMode === "set" && massValue.qtyAmount ? `All selected set to qty ${massValue.qtyAmount}` : ""}
                    {massValue.qtyMode === "add" && massValue.qtyAmount ? `Current qty + ${massValue.qtyAmount}` : ""}
                    {massValue.qtyMode === "subtract" && massValue.qtyAmount ? `Current qty − ${massValue.qtyAmount} (min 0)` : ""}
                  </span>
                  <button type="button" onClick={onApplyMassQty} disabled={!massValue.qtyAmount}
                    style={{ fontSize: 13, fontWeight: 700, background: "#E8231A", color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, cursor: "pointer", opacity: massValue.qtyAmount ? 1 : 0.45 }}>
                    Apply to {selectedIds.size} products
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── desktop table ── */}
          <div className="desktop-only" style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                <tr>
                  <th style={{ padding: "12px 16px", width: 40, textAlign: "left" }}>
                    <input
                      type="checkbox"
                      checked={displayRows.length > 0 && displayRows.every((r) => selectedIds.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(displayRows.map((r) => r.id)));
                        else setSelectedIds(new Set());
                      }}
                      style={{ accentColor: "#E8231A", cursor: "pointer" }}
                    />
                  </th>
                  {/* dynamic headers based on visibleColumns */}
                  {visibleColumns.has("image") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Image</th>
                  )}
                  {visibleColumns.has("name") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                  )}
                  {visibleColumns.has("sku") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>SKU</th>
                  )}
                  {visibleColumns.has("category") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Category</th>
                  )}
                  {visibleColumns.has("hsn") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>HSN · GST</th>
                  )}
                  {visibleColumns.has("qty") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Qty</th>
                  )}
                  {visibleColumns.has("price") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>Sale ₹ / MRP ₹</th>
                  )}
                  {visibleColumns.has("active") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Active</th>
                  )}
                  {visibleColumns.has("share") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Share</th>
                  )}
                  {visibleColumns.has("actions") && (
                    <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const selected = selectedIds.has(row.id);
                  const listEdits = listPendingEdits[row.id] || {};
                  const hasPending = Object.keys(listEdits).length > 0;

                  const valCategory = getListVal(row.id, "categoryId", row.categoryId);
                  const valHsn = getListVal(row.id, "hsnCode", row.hsnCode);
                  const valQty = getListVal(row.id, "stockQty", row.stockQty);
                  const valSalePrice = getListVal(row.id, "salePrice", row.salePrice);
                  const valBasePrice = getListVal(row.id, "basePrice", row.basePrice);

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: "1px solid #f9fafb",
                        background: hasPending ? "rgba(219,234,254,0.25)" : selected ? "rgba(232,35,26,0.03)" : "#fff",
                        opacity: !row.isActive && row.stockStatus === "out_of_stock" ? 0.6 : 1,
                        transition: "background 0.1s"
                      }}
                      onMouseEnter={(e) => { if (!selected && !hasPending) e.currentTarget.style.background = "#f9fafb"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = hasPending ? "rgba(219,234,254,0.25)" : selected ? "rgba(232,35,26,0.03)" : "#fff"; }}
                    >
                      {/* checkbox */}
                      <td style={{ padding: "14px 16px", width: 40 }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            setSelectedIds((cur) => {
                              const next = new Set(cur);
                              if (e.target.checked) next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            });
                          }}
                          style={{ accentColor: "#E8231A", cursor: "pointer" }}
                        />
                      </td>

                      {/* image */}
                      {visibleColumns.has("image") && (
                        <td style={{ padding: "10px 8px" }}>
                          <ProductThumb images={row.images} size={44} />
                        </td>
                      )}

                      {/* name */}
                      {visibleColumns.has("name") && (
                        <td style={{ padding: "12px" }}>
                          <p style={{ margin: 0, fontWeight: 600, color: "#111827", fontSize: 13, lineHeight: 1.3, maxWidth: 260 }}>
                            {row.title}
                          </p>
                        </td>
                      )}

                      {/* sku — read only */}
                      {visibleColumns.has("sku") && (
                        <td style={{ padding: "12px", fontFamily: "monospace", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {row.sku || <span style={{ color: "#d97706", fontFamily: "inherit" }}>Missing</span>}
                        </td>
                      )}

                      {/* category — editable */}
                      {visibleColumns.has("category") && (
                        <EditableCell
                          rowId={row.id} field="categoryId" value={valCategory} type="select"
                          options={categoryOptions}
                          missing={!valCategory} pending={"categoryId" in listEdits}
                          activeCell={listActiveCell} setActiveCell={setListActiveCell}
                          onChange={setListCellValue}
                        />
                      )}

                      {/* hsn — editable */}
                      {visibleColumns.has("hsn") && (
                        <EditableCell
                          rowId={row.id} field="hsnCode" value={valHsn} type="select"
                          options={hsnOptions}
                          missing={!valHsn} pending={"hsnCode" in listEdits}
                          activeCell={listActiveCell} setActiveCell={setListActiveCell}
                          onChange={setListCellValue}
                        />
                      )}

                      {/* qty — editable */}
                      {visibleColumns.has("qty") && (
                        <EditableCell
                          rowId={row.id} field="stockQty" value={valQty} type="number"
                          missing={false} pending={"stockQty" in listEdits}
                          activeCell={listActiveCell} setActiveCell={setListActiveCell}
                          onChange={setListCellValue}
                        />
                      )}

                      {/* price — sale price + base price (MRP) editable inline */}
                      {visibleColumns.has("price") && (
                        <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                          <ListPriceCell
                            rowId={row.id}
                            salePrice={valSalePrice}
                            basePrice={valBasePrice}
                            pendingSale={"salePrice" in listEdits}
                            pendingBase={"basePrice" in listEdits}
                            activeCell={listActiveCell}
                            setActiveCell={setListActiveCell}
                            onChange={setListCellValue}
                          />
                        </td>
                      )}

                      {/* active toggle */}
                      {visibleColumns.has("active") && (
                        <td style={{ padding: "12px" }}>
                          {canEdit ? (
                            <ToggleSwitch
                              checked={Boolean(row.isActive)}
                              onChange={(val) => onToggleActive(row, val)}
                            />
                          ) : (
                            <span style={{ fontSize: 12, color: row.isActive ? "#16a34a" : "#9ca3af" }}>
                              {row.isActive ? "Active" : "Inactive"}
                            </span>
                          )}
                        </td>
                      )}

                      {/* share button */}
                      {visibleColumns.has("share") && (
                        <td style={{ padding: "12px" }}>
                          <button
                            type="button"
                            onClick={() => onShareProduct(row)}
                            title={`Copy storefront URL for: ${row.title}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              fontSize: 12, color: "#6366f1", fontWeight: 600,
                              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
                              borderRadius: 6, padding: "4px 10px", cursor: "pointer"
                            }}
                          >
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                            </svg>
                            Share
                          </button>
                        </td>
                      )}

                      {/* actions */}
                      {visibleColumns.has("actions") && (
                        <td style={{ padding: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
                            {canEdit && (
                              <button type="button" onClick={() => openEdit(row)}
                                style={{ fontSize: 12, color: "#E8231A", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                                Edit
                              </button>
                            )}
                            {canEdit && (
                              <>
                                <span style={{ color: "#e5e7eb" }}>|</span>
                                <button type="button" onClick={() => openClone(row)}
                                  style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                                  Clone
                                </button>
                              </>
                            )}
                            {canDelete && (
                              <>
                                <span style={{ color: "#e5e7eb" }}>|</span>
                                <button type="button" onClick={() => onArchive(row)}
                                  style={{ fontSize: 12, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                                  Archive
                                </button>
                              </>
                            )}
                            {canEdit && (
                              <label title="Upload image" style={{ cursor: uploadingProductId === row.id ? "wait" : "pointer", display: "inline-flex", padding: "4px 4px" }}>
                                <input
                                  type="file" accept="image/*" className="hidden-input"
                                  disabled={uploadingProductId.length > 0}
                                  onChange={(e) => { const f = e.target.files?.[0]; onUploadImage(row.id, f); e.target.value = ""; }}
                                />
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                                  {uploadingProductId === row.id ? "…" : "↑"}
                                </span>
                              </label>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={2 + [...visibleColumns].length} style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                      No products match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── mobile cards ── */}
          <div className="mobile-cards">
            {displayRows.map((row) => (
              <div key={row.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <ProductThumb images={row.images} size={52} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: "#111827", fontSize: 14, lineHeight: 1.3 }}>
                      {row.title}
                    </p>
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9ca3af" }}>
                      {row.sku || "No SKU"} · {categoryNameById(categoryMap, row.categoryId)}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: "#E8231A", fontSize: 14 }}>
                        {formatCurrencyInr(row.salePrice || row.basePrice)}
                      </span>
                      <StockDot status={row.stockStatus} availableQty={row.availableQty} />
                    </div>
                  </div>
                  {canEdit && (
                    <ToggleSwitch
                      checked={Boolean(row.isActive)}
                      onChange={(val) => onToggleActive(row, val)}
                    />
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {canEdit && (
                    <button type="button" onClick={() => openEdit(row)}
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#E8231A", border: "1px solid rgba(232,35,26,0.3)", background: "rgba(232,35,26,0.04)", borderRadius: 8, padding: "7px 0", cursor: "pointer" }}>
                      Edit
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => openClone(row)}
                      style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#6b7280", border: "1px solid #e5e7eb", background: "#fff", borderRadius: 8, padding: "7px 0", cursor: "pointer" }}>
                      Clone
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" onClick={() => onArchive(row)}
                      style={{ fontSize: 13, fontWeight: 500, color: "#9ca3af", border: "1px solid #e5e7eb", background: "#fff", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── BULK EDIT VIEW ──────────────────────────────────────────────────── */}
      {viewMode === "bulk-edit" && (
        <>
          {/* Back nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "none", border: "1px solid var(--border)",
                borderRadius: 8, padding: "5px 14px", fontSize: 13,
                cursor: "pointer", color: "var(--text)", fontWeight: 500
              }}
            >
              ← Back to Products
            </button>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              / Bulk Edit {incompleteOnly ? `· ${incompleteCount} incomplete` : `· ${rows.length} total`}
            </span>
          </div>

          {/* Legend + filter bar */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: "2px 8px", borderRadius: 4 }}>Amber = missing</span>
              <span style={{ background: "#dbeafe", border: "1px solid #93c5fd", padding: "2px 8px", borderRadius: 4 }}>Blue = edited (unsaved)</span>
            </div>
            <label className="inline-check" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={incompleteOnly} onChange={(e) => { setIncompleteOnly(e.target.checked); setPage(1); }} />
              Incomplete only ({incompleteCount})
            </label>
            <input
              type="search"
              placeholder="Filter by title / SKU / brand…"
              value={filters.q}
              style={{ padding: "5px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, width: 220 }}
              onChange={(e) => { setFilters((cur) => ({ ...cur, q: e.target.value })); setPage(1); }}
            />
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
              {bulkRows.length} products · page {page}/{totalPages}
            </span>
          </div>

          {/* The grid */}
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "2px solid var(--border)" }}>
                  <th style={{ ...thStyle, width: 52 }}></th>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, minWidth: 220, textAlign: "left" }}>Title</th>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Brand</th>
                  <th style={{ ...thStyle, minWidth: 140 }}>Category</th>
                  <th style={{ ...thStyle, minWidth: 140 }}>HSN Code</th>
                  <th style={thStyle}>Base ₹</th>
                  <th style={thStyle}>Sale ₹</th>
                  <th style={thStyle}>Stock</th>
                  <th style={thStyle}>Active</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => {
                  const n = (page - 1) * PAGE_SIZE + idx + 1;
                  const edits = pendingEdits[row.id] || {};

                  const valSku = getVal(row.id, "sku", row.sku);
                  const valBrand = getVal(row.id, "brand", row.brand);
                  const valCategoryId = getVal(row.id, "categoryId", row.categoryId);
                  const valHsnCode = getVal(row.id, "hsnCode", row.hsnCode);
                  const valBasePrice = getVal(row.id, "basePrice", row.basePrice);
                  const valSalePrice = getVal(row.id, "salePrice", row.salePrice);
                  const valStockQty = getVal(row.id, "stockQty", row.stockQty);
                  const valIsActive = getVal(row.id, "isActive", row.isActive);

                  const rowIncomplete = isIncomplete(row);

                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: "1px solid var(--border)", background: rowIncomplete ? "#fffef7" : "white" }}
                    >
                      <td style={{ padding: "4px 6px", width: 52 }}>
                        <ProductThumb images={row.images} size={40} />
                      </td>
                      <td style={{ padding: "6px 8px", color: "var(--muted)", fontSize: 11, width: 32, textAlign: "center" }}>{n}</td>

                      {/* Title (not editable, links to edit modal) */}
                      <td style={{ padding: "6px 8px" }}>
                        <button
                          type="button"
                          style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "var(--info)", fontSize: 12, fontWeight: 500 }}
                          onClick={() => openEdit(row)}
                          title="Open full edit"
                        >
                          {row.title.length > 55 ? row.title.slice(0, 52) + "…" : row.title}
                        </button>
                      </td>

                      <EditableCell
                        rowId={row.id} field="sku" value={valSku} type="text"
                        missing={!valSku} pending={"sku" in edits}
                        activeCell={activeCell} setActiveCell={setActiveCell} onChange={setCellValue}
                      />
                      <EditableCell
                        rowId={row.id} field="brand" value={valBrand} type="text"
                        missing={!valBrand} pending={"brand" in edits}
                        activeCell={activeCell} setActiveCell={setActiveCell} onChange={setCellValue}
                      />
                      <EditableCell
                        rowId={row.id} field="categoryId" value={valCategoryId} type="select"
                        options={categoryOptions}
                        missing={!valCategoryId} pending={"categoryId" in edits}
                        activeCell={activeCell} setActiveCell={setActiveCell} onChange={setCellValue}
                      />
                      <EditableCell
                        rowId={row.id} field="hsnCode" value={valHsnCode} type="select"
                        options={hsnOptions}
                        missing={!valHsnCode} pending={"hsnCode" in edits}
                        activeCell={activeCell} setActiveCell={setActiveCell} onChange={setCellValue}
                      />
                      <EditableCell
                        rowId={row.id} field="basePrice" value={valBasePrice} type="number"
                        missing={false} pending={"basePrice" in edits}
                        activeCell={activeCell} setActiveCell={setActiveCell} onChange={setCellValue}
                      />
                      <EditableCell
                        rowId={row.id} field="salePrice" value={valSalePrice} type="number"
                        missing={false} pending={"salePrice" in edits}
                        activeCell={activeCell} setActiveCell={setActiveCell} onChange={setCellValue}
                      />
                      <EditableCell
                        rowId={row.id} field="stockQty" value={valStockQty} type="number"
                        missing={false} pending={"stockQty" in edits}
                        activeCell={activeCell} setActiveCell={setActiveCell} onChange={setCellValue}
                      />

                      {/* Active toggle */}
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(valIsActive)}
                          onChange={(e) => setCellValue(row.id, "isActive", e.target.checked)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                      No products match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 8 }}>
              <button type="button" className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ← Prev
              </button>
              <span style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
              <button type="button" className="btn btn-secondary btn-small" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next →
              </button>
            </div>
          )}

          {/* Floating save bar */}
          {pendingCount > 0 && (
            <div style={{
              position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
              background: "#1e293b", color: "#fff", borderRadius: 12,
              padding: "12px 24px", display: "flex", gap: 12, alignItems: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 1000
            }}>
              <span style={{ fontSize: 14 }}>
                <strong>{pendingCount}</strong> unsaved change{pendingCount !== 1 ? "s" : ""} across{" "}
                <strong>{Object.keys(pendingEdits).length}</strong> products
              </span>
              <button
                type="button"
                style={{ background: "#e8231a", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontWeight: 600, cursor: bulkSaving ? "wait" : "pointer", opacity: bulkSaving ? 0.7 : 1 }}
                disabled={bulkSaving}
                onClick={onBulkSave}
              >
                {bulkSaving ? "Saving…" : "Save All"}
              </button>
              <button
                type="button"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
                onClick={onDiscardEdits}
              >
                Discard
              </button>
            </div>
          )}
        </>
      )}

      {/* ── EDIT MODAL (shared by both views) ──────────────────────────────── */}
      <Modal
        title={editingId ? "Edit Product" : "Add Product"}
        open={modalOpen}
        onClose={closeModal}
        width="980px"
        disableOutsideClick
      >
        <form className="form-grid wide" onSubmit={onSubmit} data-modal-form>

          {/* ── CORE ── */}
          <h4 className="form-section">Core Details</h4>
          <label className="field"><span>Title *</span><input name="title" value={form.title} onChange={onFormChange} required /></label>
          <label className="field"><span>Slug</span><input name="slug" value={form.slug} onChange={onFormChange} /></label>

          {/* Category with inline-create */}
          <div className="field">
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              Category
              <button
                type="button"
                onClick={() => openInlineCreate("category")}
                style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
              >+ New</button>
            </span>
            <select name="categoryId" value={form.categoryId} onChange={onFormChange}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {inlineCreate === "category" && (
              <InlineCreateForm
                type="category" parentLabel="Category"
                form={inlineForm} onChange={onInlineFormChange}
                onSubmit={submitInlineCreate} onCancel={cancelInlineCreate}
                saving={inlineSaving} error={inlineError}
              />
            )}
          </div>

          {/* Subcategory with inline-create */}
          <div className="field">
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              Subcategory
              {form.categoryId && (
                <button
                  type="button"
                  onClick={() => openInlineCreate("subcategory")}
                  style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
                >+ New</button>
              )}
            </span>
            <select name="subcategoryId" value={form.subcategoryId} onChange={onFormChange}>
              <option value="">None</option>
              {subcategoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {inlineCreate === "subcategory" && (
              <InlineCreateForm
                type="subcategory" parentLabel="Subcategory"
                form={inlineForm} onChange={onInlineFormChange}
                onSubmit={submitInlineCreate} onCancel={cancelInlineCreate}
                saving={inlineSaving} error={inlineError}
              />
            )}
          </div>

          <label className="field"><span>Brand</span><input name="brand" value={form.brand} onChange={onFormChange} /></label>
          <label className="field"><span>Model Number</span><input name="modelNumber" value={form.modelNumber} onChange={onFormChange} /></label>

          {/* HSN Code with inline-create */}
          <div className="field">
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              HSN Code *
              <button
                type="button"
                onClick={() => openInlineCreate("hsn")}
                style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
              >+ New</button>
            </span>
            <select name="hsnCode" value={form.hsnCode} onChange={onFormChange} required>
              <option value="">Select HSN</option>
              {hsnRecords.map((h) => (
                <option key={h.hsnCode} value={h.hsnCode}>
                  {h.hsnCode} – {h.gstRate}% – {h.description ? h.description.slice(0, 50) : ""}
                </option>
              ))}
            </select>
            {inlineCreate === "hsn" && (
              <InlineCreateForm
                type="hsn" parentLabel="HSN Code"
                form={inlineForm} onChange={onInlineFormChange}
                onSubmit={submitInlineCreate} onCancel={cancelInlineCreate}
                saving={inlineSaving} error={inlineError}
              />
            )}
          </div>

          <label className="field"><span>Old URL (redirect)</span><input name="oldUrl" value={form.oldUrl} onChange={onFormChange} /></label>

          {/* ── PRICING & INVENTORY ── */}
          <h4 className="form-section">Pricing & Inventory</h4>
          <label className="field"><span>Base Price (₹) *</span><input type="number" min="0" step="0.01" name="basePrice" value={form.basePrice} onChange={onFormChange} required /></label>
          <label className="field"><span>Sale Price (₹)</span><input type="number" min="0" step="0.01" name="salePrice" value={form.salePrice} onChange={onFormChange} /></label>
          <label className="field"><span>MOQ</span><input type="number" min="1" name="moq" value={form.moq} onChange={onFormChange} /></label>
          <label className="field"><span>Quote Required Above Qty</span><input type="number" min="1" name="quoteRequiredAboveQty" value={form.quoteRequiredAboveQty} onChange={onFormChange} /></label>
          <label className="field"><span>Stock Qty</span><input type="number" min="0" name="stockQty" value={form.stockQty} onChange={onFormChange} /></label>
          <label className="field"><span>Reserved Qty</span><input type="number" min="0" name="reservedQty" value={form.reservedQty} onChange={onFormChange} /></label>
          <label className="field">
            <span>Stock Status</span>
            <select name="stockStatus" value={form.stockStatus} onChange={onFormChange}>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="backorder">Backorder</option>
            </select>
          </label>
          <label className="field"><span>Low Stock Threshold</span><input type="number" min="0" name="lowStockThreshold" value={form.lowStockThreshold} onChange={onFormChange} /></label>
          <label className="field"><span>Max Order Qty</span><input type="number" min="1" name="maxOrderQty" value={form.maxOrderQty} onChange={onFormChange} /></label>
          <label className="field"><span>Dead Weight (kg)</span><input type="number" min="0" step="0.01" name="deadWeightKg" value={form.deadWeightKg} onChange={onFormChange} /></label>
          <label className="field"><span>Length (cm)</span><input type="number" min="0" step="0.01" name="lengthCm" value={form.lengthCm} onChange={onFormChange} /></label>
          <label className="field"><span>Width (cm)</span><input type="number" min="0" step="0.01" name="widthCm" value={form.widthCm} onChange={onFormChange} /></label>
          <label className="field"><span>Height (cm)</span><input type="number" min="0" step="0.01" name="heightCm" value={form.heightCm} onChange={onFormChange} /></label>
          <label className="field"><span>Shipping Class</span><input name="shippingClass" value={form.shippingClass} onChange={onFormChange} /></label>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <label className="inline-check"><input type="checkbox" name="bulkPricingEnabled" checked={form.bulkPricingEnabled} onChange={onFormChange} /> Bulk pricing enabled</label>
            <label className="inline-check"><input type="checkbox" name="allowBackorder" checked={form.allowBackorder} onChange={onFormChange} /> Allow backorder</label>
            <label className="inline-check"><input type="checkbox" name="isActive" checked={form.isActive} onChange={onFormChange} /> Active</label>
          </div>
          <label className="field field-full"><span>Bulk Price Slabs</span><input name="bulkPriceSlabsText" value={form.bulkPriceSlabsText} onChange={onFormChange} placeholder="10:2450, 25:2300" /></label>
          <label className="field field-full"><span>Price Group Prices</span><input name="priceGroupPricesText" value={form.priceGroupPricesText} onChange={onFormChange} placeholder="dealer:4100, stockist:3950" /></label>
          <label className="field field-full"><span>Customer Specific Prices</span><input name="customerSpecificPricesText" value={form.customerSpecificPricesText} onChange={onFormChange} placeholder="user_abc:3890" /></label>

          {/* ── DESCRIPTIONS ── */}
          <h4 className="form-section">Descriptions</h4>
          <div className="field field-full">
            <span style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              Short Description <span style={{ color: "var(--muted)", fontWeight: 400 }}>({stripHtml(form.shortDescription).length}/400 chars)</span>
            </span>
            <RichTextEditor
              value={form.shortDescription}
              onChange={(html) => setForm(cur => ({ ...cur, shortDescription: html }))}
              minRows={3}
              placeholder="Brief product summary shown in listing cards…"
            />
          </div>
          <div className="field field-full">
            <span style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Full Description</span>
            <RichTextEditor
              value={form.fullDescription}
              onChange={(html) => setForm(cur => ({ ...cur, fullDescription: html }))}
              minRows={8}
              placeholder="Detailed product description with formatting…"
            />
          </div>
          <label className="field field-full"><span>Technical Keywords (comma separated)</span><input name="technicalKeywordsText" value={form.technicalKeywordsText} onChange={onFormChange} placeholder="relay, 24vdc, 10a, din rail" /></label>
          <label className="field field-full"><span>Customer Keywords (comma separated)</span><input name="customerKeywordsText" value={form.customerKeywordsText} onChange={onFormChange} placeholder="industrial relay, panel relay" /></label>
          <label className="field field-full"><span>Use Cases (comma separated)</span><input name="useCasesText" value={form.useCasesText} onChange={onFormChange} /></label>
          <label className="field field-full"><span>Problem Statements (comma separated)</span><input name="problemStatementsText" value={form.problemStatementsText} onChange={onFormChange} /></label>
          <label className="field field-full"><span>Specifications (JSON)</span><textarea rows="5" name="specificationsText" value={form.specificationsText} onChange={onFormChange} style={{ fontFamily: "monospace", fontSize: 12 }} /></label>

          {/* ── MEDIA ── */}
          <h4 className="form-section">Media</h4>

          {/* Images */}
          <div className="field field-full">
            <span style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
              Product Images
              {!editingId && pendingImages.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "#16a34a", fontWeight: 400 }}>
                  {pendingImages.length} queued — will upload after save
                </span>
              )}
            </span>

            {/* Thumbnail grid — saved images (edit) + queued previews (create) */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              {/* Existing saved images (edit mode) */}
              {(editingProduct?.images || []).map((imgUrl, idx) => (
                <div key={`saved-${idx}`} style={{ position: "relative" }}>
                  <img
                    src={resolveImageUrl(imgUrl)} alt=""
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block" }}
                  />
                  <button type="button" title="Remove image" onClick={() => onDeleteModalImage(imgUrl)}
                    style={{
                      position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                      background: "#ef4444", color: "#fff", border: "none", fontSize: 11,
                      cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center"
                    }}>×</button>
                </div>
              ))}

              {/* Pending queued images (create mode) */}
              {pendingImages.map((p, idx) => (
                <div key={`pending-${idx}`} style={{ position: "relative" }}>
                  <img src={p.previewUrl} alt={p.name}
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "2px dashed #16a34a", display: "block" }}
                  />
                  <button type="button" title="Remove" onClick={() => onRemovePendingImage(idx)}
                    style={{
                      position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                      background: "#ef4444", color: "#fff", border: "none", fontSize: 11,
                      cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center"
                    }}>×</button>
                  <span style={{
                    position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center",
                    fontSize: 9, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: "0 0 4px 4px"
                  }}>queued</span>
                </div>
              ))}

              {/* + Add placeholder tile */}
              <label title="Add image" style={{
                width: 80, height: 80, borderRadius: 6, border: "2px dashed var(--border)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: uploadingModalImage ? "wait" : "pointer", color: "var(--muted)",
                fontSize: 11, gap: 4, flexShrink: 0, background: "#f9fafb"
              }}>
                {uploadingModalImage ? (
                  <span style={{ fontSize: 10 }}>Uploading…</span>
                ) : (
                  <>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
                    <span>Add image</span>
                  </>
                )}
                <input
                  ref={modalImageRef} type="file" accept="image/*" multiple className="hidden-input"
                  disabled={uploadingModalImage}
                  onChange={(e) => {
                    if (editingId) {
                      // Immediate upload for existing products
                      Array.from(e.target.files || []).forEach(f => onUploadModalImage(f));
                    } else {
                      // Queue for new products
                      onAddPendingImage(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {!editingId && (
              <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Images with green border are queued and will be uploaded automatically when you save.
              </p>
            )}
          </div>

          {/* ── Video Links & Uploads ── */}
          <div className="field field-full">
            <span style={{ display: "block", marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
              Videos ({(form.videos || []).length})
              <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>
                YouTube, Facebook, Instagram, Vimeo — or upload an MP4
              </span>
            </span>
            <VideoMediaPanel
              videos={form.videos || []}
              onChange={(v) => setForm(cur => ({ ...cur, videos: v }))}
              onUploadFile={onUploadModalVideo}
              uploadingFile={uploadingVideo}
              editingId={editingId}
              videoRef={modalVideoRef}
            />
          </div>

          {/* ── Files / Downloads ── */}
          <div className="field field-full">
            <span style={{ display: "block", marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
              Files & Downloads ({(form.downloads || []).length})
              <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>
                Datasheets, manuals, spec sheets — paste a URL or upload
              </span>
            </span>
            <FileMediaPanel
              downloads={form.downloads || []}
              onChange={(d) => setForm(cur => ({ ...cur, downloads: d }))}
              onUploadFile={onUploadModalDocument}
              uploadingFile={uploadingDocument}
              editingId={editingId}
              fileRef={modalDocRef}
            />
          </div>

          {/* ── SEO / META ── */}
          <h4 className="form-section" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            SEO &amp; Meta
            <button
              type="button"
              onClick={onAutoGenerateSeo}
              style={{
                fontSize: 12, fontWeight: 500, padding: "3px 12px",
                background: "#e8231a", color: "#fff", border: "none",
                borderRadius: 6, cursor: "pointer"
              }}
            >
              ✦ Auto-Generate SEO
            </button>
          </h4>
          <label className="field field-full">
            <span>Meta Title <span style={{ color: "var(--muted)", fontWeight: 400 }}>({(form.metaTitle || "").length}/60 — Google shows ~60 chars)</span></span>
            <input name="metaTitle" value={form.metaTitle} onChange={onFormChange} maxLength={120} placeholder="e.g. 24V DC Relay | Jenix India" />
          </label>
          <label className="field field-full">
            <span>Meta Description <span style={{ color: "var(--muted)", fontWeight: 400 }}>({(form.metaDescription || "").length}/155 chars)</span></span>
            <textarea rows="2" name="metaDescription" value={form.metaDescription} onChange={onFormChange} maxLength={320} placeholder="Brief description for Google search snippet…" />
          </label>
          <label className="field field-full">
            <span>Meta Keywords <span style={{ color: "var(--muted)", fontWeight: 400 }}>(comma separated, for AI search indexing)</span></span>
            <input name="metaKeywords" value={form.metaKeywords} onChange={onFormChange} placeholder="relay, industrial relay, 24vdc, jenix" />
          </label>

          {/* ── GOOGLE SHOPPING ── */}
          <h4 className="form-section">Google Shopping Feed</h4>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "-8px 0 8px", gridColumn: "1/-1" }}>
            Leave blank to auto-fill from title/description when exporting. Use <strong>Export Google Shopping</strong> from the product list to download the TSV feed.
          </p>
          <label className="field field-full"><span>Shopping Title (max 150 chars)</span><input name="googleShoppingTitle" value={form.googleShoppingTitle} onChange={onFormChange} maxLength={150} /></label>
          <label className="field field-full"><span>Shopping Description</span><textarea rows="2" name="googleShoppingDescription" value={form.googleShoppingDescription} onChange={onFormChange} /></label>
          <label className="field"><span>Google Product Category</span><input name="googleProductCategory" value={form.googleProductCategory} onChange={onFormChange} placeholder="Electronics > Industrial" /></label>
          <label className="field"><span>Product Type</span><input name="productType" value={form.productType} onChange={onFormChange} placeholder="Relays > Power Relays" /></label>

          {/* ── LINKED PRODUCTS ── */}
          <h4 className="form-section">Linked Products</h4>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "-8px 0 8px", gridColumn: "1/-1" }}>
            These appear on the buyer product page below the main product. <strong>Related Products</strong> shows alternatives; <strong>Accessories</strong> shows add-ons.
          </p>
          <ProductRelationPicker
            label="Related Products"
            ids={form.relationsRelated}
            setIds={(updater) => setForm((cur) => ({ ...cur, relationsRelated: typeof updater === "function" ? updater(cur.relationsRelated) : updater }))}
            allProducts={rows}
            currentId={editingId}
          />
          <ProductRelationPicker
            label="Accessories"
            ids={form.relationsAccessory}
            setIds={(updater) => setForm((cur) => ({ ...cur, relationsAccessory: typeof updater === "function" ? updater(cur.relationsAccessory) : updater }))}
            allProducts={rows}
            currentId={editingId}
          />

          {modalError && (
            <div style={{
              gridColumn: "1 / -1", padding: "10px 14px", borderRadius: 8,
              background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
              color: "var(--danger)", fontSize: 13, fontWeight: 500
            }}>
              {modalError}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Update Product" : "Create Product"}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

const thStyle = {
  padding: "8px 10px",
  fontWeight: 600,
  fontSize: 12,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
  textAlign: "center"
};
