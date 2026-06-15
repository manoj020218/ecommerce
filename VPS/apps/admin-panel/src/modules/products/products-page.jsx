import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
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
  productType: "", isActive: true, stockQty: 0, reservedQty: 0,
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
    productType: product.productType || "", isActive: Boolean(product.isActive),
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

// ── main page ─────────────────────────────────────────────────────────────────

export function ProductsPage() {
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

  // ── list view handlers ───────────────────────────────────────────────────────

  const onFilterSubmit = async (e) => { e.preventDefault(); await loadProducts(filters); };

  const clearPendingImages = (imgs = pendingImages) => {
    imgs.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPendingImages([]);
  };

  const openCreate = () => {
    setEditingId(null);
    setEditingProduct(null);
    setForm({ ...EMPTY_FORM, hsnCode: hsnRecords[0]?.hsnCode || "" });
    setDocTitle("");
    clearPendingImages();
    setModalOpen(true);
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

  // ── bulk-edit display rows ────────────────────────────────────────────────────

  const bulkRows = useMemo(() => {
    let display = [...rows];
    if (incompleteOnly) display = display.filter(isIncomplete);
    const q = filters.q.toLowerCase();
    if (q) display = display.filter((r) => `${r.title} ${r.sku} ${r.brand}`.toLowerCase().includes(q));
    return display;
  }, [rows, incompleteOnly, filters.q]);

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
          <form className="filter-bar" onSubmit={onFilterSubmit}>
            <input
              type="search"
              placeholder="Search title, SKU, model…"
              value={filters.q}
              onChange={(e) => setFilters((cur) => ({ ...cur, q: e.target.value }))}
            />
            <select
              value={filters.categoryId}
              onChange={(e) => setFilters((cur) => ({ ...cur, categoryId: e.target.value }))}
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={filters.includeInactive}
                onChange={(e) => setFilters((cur) => ({ ...cur, includeInactive: e.target.checked }))}
              />
              Include inactive
            </label>
            <button type="submit" className="btn btn-secondary btn-small">Apply</button>
          </form>

          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 56 }}></th>
                  <th>Product</th><th>SKU</th><th>Category</th><th>Price</th>
                  <th>Stock</th><th>Status</th><th>Images</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={isIncomplete(row) ? { background: "#fffbeb" } : {}}>
                    <td style={{ padding: "6px 8px" }}>
                      <ProductThumb images={row.images} size={44} />
                    </td>
                    <td>
                      <strong>{row.title}</strong>
                      <p className="row-sub">HSN {row.hsnCode || "—"} | GST {row.gstRate}%</p>
                    </td>
                    <td>{row.sku || <span style={{ color: "#d97706" }}>Missing</span>}</td>
                    <td>{categoryNameById(categoryMap, row.categoryId)}</td>
                    <td>
                      <strong>{formatCurrencyInr(row.salePrice)}</strong>
                      {Number(row.basePrice) !== Number(row.salePrice) && (
                        <p className="row-sub line-through">{formatCurrencyInr(row.basePrice)}</p>
                      )}
                    </td>
                    <td>{stockSummary(row)}</td>
                    <td>
                      <StatusBadge value={row.stockStatus} />
                      <span className="spacer-inline" />
                      <StatusBadge value={row.isActive ? "active" : "inactive"} />
                    </td>
                    <td>{Array.isArray(row.images) ? row.images.length : 0}</td>
                    <td className="row-actions">
                      {canEdit && (
                        <button type="button" className="btn-link" onClick={() => openEdit(row)}>Edit</button>
                      )}
                      {canDelete && (
                        <button type="button" className="btn-link danger" onClick={() => onArchive(row)}>Archive</button>
                      )}
                      {canEdit && (
                        <label className="btn-link">
                          {uploadingProductId === row.id ? "Uploading…" : "Upload Image"}
                          <input
                            type="file" accept="image/*" className="hidden-input"
                            disabled={uploadingProductId.length > 0}
                            onChange={(e) => { const f = e.target.files?.[0]; onUploadImage(row.id, f); e.target.value = ""; }}
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {rows.map((row) => (
              <article key={row.id} className="card">
                <div className="card-head">
                  <h4>{row.title}</h4>
                  <StatusBadge value={row.stockStatus} />
                </div>
                <p className="muted">{row.sku || "No SKU"}</p>
                <p className="muted">{categoryNameById(categoryMap, row.categoryId)} | HSN {row.hsnCode || "—"}</p>
                <p>{formatCurrencyInr(row.salePrice)}</p>
                <div className="card-actions">
                  {canEdit && <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>Edit</button>}
                  {canDelete && <button type="button" className="btn btn-danger" onClick={() => onArchive(row)}>Archive</button>}
                </div>
              </article>
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
