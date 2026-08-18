import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { hasPermission } from "../../shared/utils/permissions";
import { formatCurrencyInr, splitCsvInput, toCsvInput } from "../../shared/utils/formatters";
import { RichTextEditor } from "../../shared/components/rich-text-editor";
import { API_BASE_URL } from "../../shared/api/http-client";
import { fetchCategories, createCategory } from "../categories/categories.api";
import { fetchHsnTaxRecords, createHsnTaxRecord } from "../hsn-tax/hsn-tax.api";
import {
  fetchProduct,
  fetchProducts,
  updateProduct,
  uploadProductImage,
  deleteProductImage,
  generateProductContentDraft
} from "./products.api";
import { fetchShippingClasses } from "../shipping/shipping.api";

const BACKEND_BASE = API_BASE_URL.replace(/\/api$/, "");

const FIELD_ERROR_MAP = [
  ["title", "title"], ["slug", "slug"], ["hsn", "hsnCode"], ["hsncode", "hsnCode"],
  ["category", "categoryId"], ["base price", "basePrice"], ["sale price", "salePrice"],
  ["price", "basePrice"], ["brand", "brand"], ["model", "modelNumber"],
  ["stock", "stockQty"], ["weight", "deadWeightKg"], ["moq", "moq"],
  ["meta title", "metaTitle"], ["meta description", "metaDescription"],
];

function slugify(v) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function autoGenerateSeo(form, firstImageUrl) {
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
  (form.tags || []).forEach(t => words.add(t.toLowerCase()));
  const metaKeywords = [...words].slice(0, 20).join(", ");
  const googleShoppingTitle = `${title}${brand ? ` - ${brand}` : ""}`.slice(0, 150);
  const googleShoppingDescription = rawDesc.slice(0, 500);
  return { metaTitle, metaDescription, metaKeywords, googleShoppingTitle, googleShoppingDescription, ogImageUrl: firstImageUrl || "" };
}

function parseBulkPriceSlabs(text) {
  if (!text?.trim()) return [];
  return text.split(",").map(p => p.trim()).filter(Boolean).map(part => {
    const [minQtyRaw, unitPriceRaw] = part.split(":").map(v => v.trim());
    const minQty = Number(minQtyRaw); const unitPrice = Number(unitPriceRaw);
    if (!Number.isInteger(minQty) || minQty < 1 || Number.isNaN(unitPrice))
      throw new Error("Invalid bulk slab format. Use minQty:unitPrice, e.g. 10:2450, 25:2300");
    return { minQty, unitPrice };
  });
}

function parseStructuredPrices(text, keyName) {
  if (!text?.trim()) return [];
  return text.split(",").map(p => p.trim()).filter(Boolean).map(part => {
    const [keyRaw, unitPriceRaw] = part.split(":").map(v => v.trim());
    const unitPrice = Number(unitPriceRaw);
    if (!keyRaw || Number.isNaN(unitPrice) || unitPrice < 0) throw new Error(`Invalid ${keyName} format.`);
    return { [keyName]: keyRaw, unitPrice };
  });
}

function bulkPriceSlabsToText(slabs) {
  if (!Array.isArray(slabs) || slabs.length === 0) return "";
  return slabs.map(s => `${s.minQty}:${s.unitPrice}`).join(", ");
}

function structuredPricesToText(rows, keyName) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  return rows.map(r => `${r[keyName]}:${r.unitPrice}`).join(", ");
}

function resolveImageUrl(image) {
  if (!image) return null;
  const src = typeof image === "string" ? image : (image.thumbnail || image.url || "");
  if (!src) return null;
  if (src.startsWith("http")) return src;
  if (src.startsWith("/static")) return `${BACKEND_BASE}${src}`;
  return `${BACKEND_BASE}/static/migration/${src}`;
}

function formFromProduct(product) {
  return {
    title: product.title || "",
    slug: product.slug || "",
    oldUrl: product.oldUrl || "",
    categoryId: product.categoryId || "",
    subcategoryId: product.subcategoryId || "",
    brand: product.brand || "",
    modelNumber: product.modelNumber || "",
    hsnCode: product.hsnCode || "",
    basePrice: product.basePrice ?? "",
    salePrice: product.salePrice ?? "",
    shortDescription: product.shortDescription || "",
    fullDescription: product.fullDescription || "",
    specificationsText: JSON.stringify(product.specifications || {}, null, 2),
    keyFeaturesText: Array.isArray(product.keyFeatures) ? product.keyFeatures.join("\n") : "",
    technicalKeywordsText: toCsvInput(product.technicalKeywords),
    customerKeywordsText: toCsvInput(product.customerKeywords),
    useCasesText: toCsvInput(product.useCases),
    problemStatementsText: toCsvInput(product.problemStatements),
    moq: Number(product.moq || 1),
    bulkPricingEnabled: Boolean(product.bulkPricingEnabled),
    bulkPriceSlabsText: bulkPriceSlabsToText(product.bulkPriceSlabs),
    priceGroupPricesText: structuredPricesToText(product.priceGroupPrices, "priceGroup"),
    customerSpecificPricesText: structuredPricesToText(product.customerSpecificPrices, "customerId"),
    quoteRequiredAboveQty: product.quoteRequiredAboveQty == null ? "" : Number(product.quoteRequiredAboveQty),
    deadWeightKg: Number(product.deadWeightKg || 0),
    lengthCm: product.lengthCm ?? "",
    widthCm: product.widthCm ?? "",
    heightCm: product.heightCm ?? "",
    shippingClass: product.shippingClass || "normal",
    videos: Array.isArray(product.videos) && product.videos.length
      ? product.videos.map(v => ({ url: v.url || "", label: v.label || "" }))
      : product.youtubeUrl ? [{ url: product.youtubeUrl, label: "" }] : [],
    downloads: Array.isArray(product.downloads) ? product.downloads.map(d => ({ title: d.title || "", url: d.url || "" })) : [],
    metaTitle: product.metaTitle || "",
    metaDescription: product.metaDescription || "",
    metaKeywords: product.metaKeywords || "",
    googleShoppingTitle: product.googleShoppingTitle || "",
    googleShoppingDescription: product.googleShoppingDescription || "",
    googleProductCategory: product.googleProductCategory || "",
    productType: product.productType || "",
    priceIncludesGst: Boolean(product.priceIncludesGst),
    shippingIncluded: Boolean(product.shippingIncluded),
    isActive: Boolean(product.isActive),
    stockQty: Number(product.stockQty || 0),
    reservedQty: Number(product.reservedQty || 0),
    stockStatus: product.stockStatus || "in_stock",
    allowBackorder: Boolean(product.allowBackorder),
    maxOrderQty: Number(product.maxOrderQty || 1000),
    lowStockThreshold: Number(product.lowStockThreshold || 0),
    tags: Array.isArray(product.tags) ? product.tags : [],
    productLabel: product.productLabel || "",
    relatedProductIds: Array.isArray(product.relations?.related) ? product.relations.related : [],
    fulfillmentType: product.fulfillmentType || "standard",
    uploadMode: product.uploadMode || "single_design",
    uploadSpec: {
      cardWidthMm: product.uploadSpec?.cardWidthMm ?? "",
      cardHeightMm: product.uploadSpec?.cardHeightMm ?? "",
      minWidthPx: product.uploadSpec?.minWidthPx ?? "",
      minHeightPx: product.uploadSpec?.minHeightPx ?? "",
      maxFileSizeMb: product.uploadSpec?.maxFileSizeMb ?? 20,
      allowedFormats: Array.isArray(product.uploadSpec?.allowedFormats) && product.uploadSpec.allowedFormats.length
        ? product.uploadSpec.allowedFormats
        : ["jpg", "png", "pdf"]
    },
    customOptions: Array.isArray(product.customOptions) ? product.customOptions : [],
    printTemplates: Array.isArray(product.printTemplates) ? product.printTemplates : [],
  };
}

// ── Layout components ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
      {title && (
        <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function FieldRow({ children, cols = 2 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Field({ label, hint, required, error, children, full, noLabel }) {
  const Wrapper = noLabel ? "div" : "label";
  return (
    <div style={full ? { marginBottom: 12 } : {}}>
      <Wrapper style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: error ? "var(--danger)" : "var(--text)" }}>
          {label}{required && <span style={{ color: "var(--danger)" }}> *</span>}
          {hint && <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 6 }}>{hint}</span>}
        </span>
        {children}
      </Wrapper>
      {error && <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}

const inputStyle = (err) => ({
  padding: "7px 10px", fontSize: 13,
  border: `1px solid ${err ? "var(--danger)" : "var(--border)"}`,
  borderRadius: 7, width: "100%", boxSizing: "border-box",
  outline: err ? "2px solid rgba(220,38,38,0.15)" : "none"
});

const selectStyle = (err) => ({ ...inputStyle(err), background: "var(--surface)" });

// ── Inline quick-create ───────────────────────────────────────────────────────

function InlineCreate({ type, parentId, onCreated, onCancel }) {
  const [form, setForm] = useState(
    type === "hsn"
      ? { hsnCode: "", gstRate: "18", description: "", effectiveFrom: new Date().toISOString().slice(0, 10) }
      : { name: "" }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSaving(true); setErr("");
    try {
      if (type === "hsn") {
        await createHsnTaxRecord({ hsnCode: form.hsnCode.trim(), description: form.description.trim(), gstRate: Number(form.gstRate || 18), effectiveFrom: form.effectiveFrom });
        onCreated(form.hsnCode.trim());
      } else {
        const result = await createCategory({ name: form.name.trim(), parentCategoryId: parentId || null });
        onCreated(result?.id);
      }
    } catch (e) { setErr(e.message || "Failed."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(232,35,26,0.04)", border: "1.5px solid var(--brand)", borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginBottom: 8 }}>
        + Quick Create {type === "hsn" ? "HSN Code" : type === "category" ? "Category" : "Subcategory"}
      </div>
      {type === "hsn" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="HSN Code" value={form.hsnCode} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))} style={{ flex: "0 0 100px", padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5 }} />
          <input placeholder="GST %" type="number" value={form.gstRate} onChange={e => setForm(f => ({ ...f, gstRate: e.target.value }))} style={{ flex: "0 0 70px", padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5 }} />
          <input placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ flex: "1 1 160px", padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5 }} />
          <input type="date" value={form.effectiveFrom} onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))} style={{ flex: "0 0 130px", padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5 }} />
        </div>
      ) : (
        <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5, boxSizing: "border-box" }} />
      )}
      {err && <p style={{ color: "var(--danger)", fontSize: 11, margin: "5px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-primary btn-small" onClick={submit} disabled={saving} style={{ fontSize: 12 }}>{saving ? "Creating…" : "Create"}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel} style={{ fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Related products picker ───────────────────────────────────────────────────

function RelatedProductsPicker({ allProducts, selectedIds, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allProducts
      .filter(p => !selectedIds.includes(p.id) && (
        p.title.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q)
      ))
      .slice(0, 8);
  }, [query, allProducts, selectedIds]);

  const selected = allProducts.filter(p => selectedIds.includes(p.id));
  const add = (product) => { onChange([...selectedIds, product.id]); inputRef.current?.focus(); };
  const remove = (id) => onChange(selectedIds.filter(x => x !== id));

  useEffect(() => {
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selected.map(p => (
            <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 500, color: "#1d4ed8" }}>
              {p.title.length > 32 ? p.title.slice(0, 30) + "…" : p.title}
              <button type="button" onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => query && setOpen(true)} placeholder="Type product name or SKU…" style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, boxSizing: "border-box" }} />
        {open && suggestions.length > 0 && (
          <div ref={dropRef} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", maxHeight: 240, overflowY: "auto" }}>
            {suggestions.map(p => {
              const firstImg = resolveImageUrl(p.images?.[0]);
              return (
                <div key={p.id} onMouseDown={() => add(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  {firstImg ? <img src={firstImg} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0, border: "1px solid var(--border)" }} />
                    : <div style={{ width: 32, height: 32, borderRadius: 4, background: "#f3f4f6", flexShrink: 0 }} />}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{[p.sku, p.brand, p.hsnCode && `HSN ${p.hsnCode}`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{formatCurrencyInr(p.salePrice || p.basePrice)}</div>
                </div>
              );
            })}
          </div>
        )}
        {open && query.trim() && suggestions.length === 0 && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px", fontSize: 13, color: "var(--muted)" }}>
            No products found for "{query}"
          </div>
        )}
      </div>
      {selected.length > 0 && <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--muted)" }}>{selected.length} related product{selected.length !== 1 ? "s" : ""} selected</p>}
    </div>
  );
}

// ── Tags input ────────────────────────────────────────────────────────────────

function TagsInput({ tags, onChange }) {
  const [input, setInput] = useState("");

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
  };

  const handleKey = (e) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      input.split(",").map(s => s.trim()).filter(Boolean).forEach(addTag);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (input.trim()) { input.split(",").map(s => s.trim()).filter(Boolean).forEach(addTag); setInput(""); }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 7, minHeight: 38, background: "var(--surface)", cursor: "text" }}
      onClick={e => e.currentTarget.querySelector("input")?.focus()}>
      {tags.map(tag => (
        <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 500, color: "#334155" }}>
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} onBlur={handleBlur}
        placeholder={tags.length === 0 ? "Type tag, press comma or Enter…" : ""}
        style={{ border: "none", outline: "none", fontSize: 13, minWidth: 120, flex: 1, background: "transparent", padding: "1px 0" }} />
    </div>
  );
}

// ── Video / Downloads panels ──────────────────────────────────────────────────

function VideoPanel({ videos, onChange }) {
  const [newUrl, setNewUrl] = useState(""); const [newLabel, setNewLabel] = useState("");
  const add = () => { if (!newUrl.trim()) return; onChange([...videos, { url: newUrl.trim(), label: newLabel.trim() }]); setNewUrl(""); setNewLabel(""); };
  const remove = (i) => onChange(videos.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {videos.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={v.url} onChange={e => onChange(videos.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} style={{ flex: 1, padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5 }} placeholder="URL" />
          <input value={v.label || ""} onChange={e => onChange(videos.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ width: 130, padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5 }} placeholder="Label" />
          <button type="button" onClick={() => remove(i)} style={{ background: "#fee2e2", border: "none", borderRadius: 5, padding: "4px 10px", cursor: "pointer", color: "#ef4444", fontWeight: 700 }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} style={{ flex: "1 1 240px", fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6 }} placeholder="Paste YouTube, Facebook, Instagram, Vimeo URL…" />
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ width: 160, fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6 }} placeholder="Label (optional)" />
        <button type="button" onClick={add} className="btn btn-secondary btn-small">+ Add Video</button>
      </div>
    </div>
  );
}

function DownloadsPanel({ downloads, onChange }) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState("");
  const add = () => { if (!title.trim() || !url.trim()) return; onChange([...downloads, { title: title.trim(), url: url.trim() }]); setTitle(""); setUrl(""); };
  const remove = (i) => onChange(downloads.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {downloads.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 16 }}>📄</span>
          <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: "var(--brand)", wordBreak: "break-all" }}>{d.title}</a>
          <button type="button" onClick={() => remove(i)} style={{ background: "#fee2e2", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", color: "#ef4444", fontWeight: 700 }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} style={{ flex: "0 0 160px", fontSize: 13, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5 }} placeholder="Title (e.g. Datasheet)" />
        <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} style={{ flex: 1, fontSize: 13, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5 }} placeholder="https://..." />
        <button type="button" onClick={add} className="btn btn-secondary btn-small">+ Add Link</button>
      </div>
    </div>
  );
}

// Custom-print add-on pricing editor -- this is the "product type changes
// what admin can configure" mechanism: option groups (e.g. "Frequency
// Type") each holding choices (e.g. "Mifare") with a per-choice price
// delta, generic across any custom-print product rather than one-off code
// per product. A choice can optionally reference a print template (below)
// for the safe-zone hole overlay.
function CustomOptionsPanel({ groups, templates, onChange }) {
  const addGroup = () => {
    onChange([
      ...groups,
      { id: `group_${Date.now()}`, label: "New Option Group", required: true, choices: [] }
    ]);
  };
  const updateGroup = (gi, patch) => {
    onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  };
  const removeGroup = (gi) => onChange(groups.filter((_, i) => i !== gi));
  const addChoice = (gi) => {
    const choices = [
      ...groups[gi].choices,
      { id: `choice_${Date.now()}`, label: "New Choice", priceDelta: 0, default: groups[gi].choices.length === 0, safeZoneTemplateId: "" }
    ];
    updateGroup(gi, { choices });
  };
  const updateChoice = (gi, ci, patch) => {
    const choices = groups[gi].choices.map((c, i) => (i === ci ? { ...c, ...patch } : c));
    updateGroup(gi, { choices });
  };
  const removeChoice = (gi, ci) => {
    updateGroup(gi, { choices: groups[gi].choices.filter((_, i) => i !== ci) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map((group, gi) => (
        <div key={gi} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input
              value={group.label}
              onChange={(e) => updateGroup(gi, { label: e.target.value })}
              style={{ ...inputStyle(), flex: 1, fontWeight: 700 }}
              placeholder="Option group label (e.g. Frequency Type)"
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={Boolean(group.required)} onChange={(e) => updateGroup(gi, { required: e.target.checked })} />
              Required
            </label>
            <button type="button" onClick={() => removeGroup(gi)} style={{ background: "#fee2e2", border: "none", borderRadius: 5, padding: "4px 9px", cursor: "pointer", color: "#ef4444", fontWeight: 700 }}>Remove Group</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {group.choices.map((choice, ci) => (
              <div key={ci} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={choice.label}
                  onChange={(e) => updateChoice(gi, ci, { label: e.target.value })}
                  style={{ ...inputStyle(), flex: "1 1 160px" }}
                  placeholder="Choice label (e.g. Mifare 13.56MHz)"
                />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>+₹</span>
                <input
                  type="number"
                  value={choice.priceDelta}
                  onChange={(e) => updateChoice(gi, ci, { priceDelta: Number(e.target.value) })}
                  style={{ ...inputStyle(), flex: "0 0 80px" }}
                />
                <select
                  value={choice.safeZoneTemplateId || ""}
                  onChange={(e) => updateChoice(gi, ci, { safeZoneTemplateId: e.target.value })}
                  style={{ ...selectStyle(), flex: "0 0 170px" }}
                >
                  <option value="">No safe-zone template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.label || t.id}</option>
                  ))}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, whiteSpace: "nowrap" }}>
                  <input
                    type="radio"
                    name={`default-${gi}`}
                    checked={Boolean(choice.default)}
                    onChange={() => updateGroup(gi, { choices: group.choices.map((c, i) => ({ ...c, default: i === ci })) })}
                  />
                  Default
                </label>
                <button type="button" onClick={() => removeChoice(gi, ci)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => addChoice(gi)} className="btn btn-secondary btn-small" style={{ alignSelf: "flex-start", marginTop: 4 }}>+ Add Choice</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addGroup} className="btn btn-secondary btn-small" style={{ alignSelf: "flex-start" }}>+ Add Option Group</button>
    </div>
  );
}

// Print-safe-zone templates -- referenced by a customOption choice above
// (e.g. the "2-Screw Fix" choice), drives both the buyer-facing overlay on
// the storefront configurator and the admin Print Jobs review screen.
// Distances are measured from the two adjacent edges to the hole CENTER,
// the way it'd actually be measured off two edges with calipers.
function PrintTemplatesPanel({ templates, onChange }) {
  const addTemplate = () => {
    onChange([
      ...templates,
      {
        id: `template_${Date.now()}`,
        label: "New Template",
        holes: [
          { edge: "left", distanceFromSideMm: 8, distanceFromTopMm: 8, diameterMm: 3, marginMm: 1.5 },
          { edge: "right", distanceFromSideMm: 8, distanceFromTopMm: 8, diameterMm: 3, marginMm: 1.5 }
        ]
      }
    ]);
  };
  const updateTemplate = (ti, patch) => onChange(templates.map((t, i) => (i === ti ? { ...t, ...patch } : t)));
  const removeTemplate = (ti) => onChange(templates.filter((_, i) => i !== ti));
  const updateHole = (ti, hi, patch) => {
    const holes = templates[ti].holes.map((h, i) => (i === hi ? { ...h, ...patch } : h));
    updateTemplate(ti, { holes });
  };
  const addHole = (ti) => {
    updateTemplate(ti, {
      holes: [...templates[ti].holes, { edge: "left", distanceFromSideMm: 8, distanceFromTopMm: 8, diameterMm: 3, marginMm: 1.5 }]
    });
  };
  const removeHole = (ti, hi) => updateTemplate(ti, { holes: templates[ti].holes.filter((_, i) => i !== hi) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {templates.map((template, ti) => (
        <div key={ti} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input
              value={template.label}
              onChange={(e) => updateTemplate(ti, { label: e.target.value })}
              style={{ ...inputStyle(), flex: 1, fontWeight: 700 }}
              placeholder="Template name (e.g. 2-Screw Fix)"
            />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>id: {template.id}</span>
            <button type="button" onClick={() => removeTemplate(ti)} style={{ background: "#fee2e2", border: "none", borderRadius: 5, padding: "4px 9px", cursor: "pointer", color: "#ef4444", fontWeight: 700 }}>Remove Template</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {template.holes.map((hole, hi) => (
              <div key={hi} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                <select value={hole.edge} onChange={(e) => updateHole(ti, hi, { edge: e.target.value })} style={{ ...selectStyle(), flex: "0 0 90px" }}>
                  <option value="left">Left edge</option>
                  <option value="right">Right edge</option>
                </select>
                <span>from side</span>
                <input type="number" value={hole.distanceFromSideMm} onChange={(e) => updateHole(ti, hi, { distanceFromSideMm: Number(e.target.value) })} style={{ ...inputStyle(), flex: "0 0 60px" }} />
                <span>mm, from top</span>
                <input type="number" value={hole.distanceFromTopMm} onChange={(e) => updateHole(ti, hi, { distanceFromTopMm: Number(e.target.value) })} style={{ ...inputStyle(), flex: "0 0 60px" }} />
                <span>mm, ⌀</span>
                <input type="number" value={hole.diameterMm} onChange={(e) => updateHole(ti, hi, { diameterMm: Number(e.target.value) })} style={{ ...inputStyle(), flex: "0 0 55px" }} />
                <span>mm, margin</span>
                <input type="number" value={hole.marginMm} onChange={(e) => updateHole(ti, hi, { marginMm: Number(e.target.value) })} style={{ ...inputStyle(), flex: "0 0 55px" }} />
                <span>mm</span>
                <button type="button" onClick={() => removeHole(ti, hi)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => addHole(ti)} className="btn btn-secondary btn-small" style={{ alignSelf: "flex-start", marginTop: 4 }}>+ Add Hole</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addTemplate} className="btn btn-secondary btn-small" style={{ alignSelf: "flex-start" }}>+ Add Template</button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function EditProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canEdit = hasPermission(session, "products.edit");

  const [categories, setCategories] = useState([]);
  const [hsnRecords, setHsnRecords] = useState([]);
  const [shippingClasses, setShippingClasses] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productTitle, setProductTitle] = useState("");

  const [form, setForm] = useState(null);
  const [existingImages, setExistingImages] = useState([]);
  const [pendingImages, setPendingImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [inlineCreate, setInlineCreate] = useState(null);
  const fieldRefs = useRef({});
  const registerRef = (name) => (el) => { if (el) fieldRefs.current[name] = el; };

  useEffect(() => {
    const init = async () => {
      try {
        const [product, cats, hsn, products, classes] = await Promise.all([
          fetchProduct(productId),
          fetchCategories({ includeInactive: true, q: "" }),
          fetchHsnTaxRecords({ includeInactive: false, q: "" }),
          fetchProducts({ includeInactive: false, q: "" }),
          fetchShippingClasses().catch(() => [])
        ]);
        setCategories(Array.isArray(cats) ? cats : []);
        setHsnRecords(Array.isArray(hsn) ? hsn : []);
        setShippingClasses(Array.isArray(classes) ? classes.filter(c => c.isActive) : []);
        setAllProducts(Array.isArray(products) ? products.filter(p => p.id !== productId) : []);
        setProductTitle(product.title || "");
        setExistingImages(Array.isArray(product.images) ? product.images : []);
        setForm(formFromProduct(product));
      } catch (e) {
        setError(e.message || "Failed to load product.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [productId]);

  const subcategoryOptions = useMemo(
    () => categories.filter(c => c.parentCategoryId === (form?.categoryId || "")),
    [categories, form?.categoryId]
  );

  const set = (name, val) => setForm(f => ({ ...f, [name]: val }));
  const onFC = (e) => {
    const { name, value, type, checked } = e.target;
    set(name, type === "checkbox" ? checked : value);
    if (fieldErrors[name]) setFieldErrors(fe => ({ ...fe, [name]: "" }));
  };

  const focusFirstError = (msg, ferrs) => {
    const lower = msg.toLowerCase();
    const errField = Object.entries(ferrs || {}).find(([, v]) => v)?.[0];
    if (errField && fieldRefs.current[errField]) { fieldRefs.current[errField].focus(); fieldRefs.current[errField].scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    for (const [keyword, name] of FIELD_ERROR_MAP) {
      if (lower.includes(keyword) && fieldRefs.current[name]) { fieldRefs.current[name].focus(); fieldRefs.current[name].scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    }
  };

  const imageInputRef = useRef(null);
  const addImages = (files) => {
    if (!files?.length) return;
    const entries = Array.from(files).map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPendingImages(cur => [...cur, ...entries]);
  };
  const removePendingImage = (i) => {
    setPendingImages(cur => { URL.revokeObjectURL(cur[i].previewUrl); return cur.filter((_, idx) => idx !== i); });
  };
  const removeExistingImage = async (imageUrl) => {
    try {
      await deleteProductImage(productId, imageUrl);
      setExistingImages(cur => cur.filter(img => {
        const src = typeof img === "string" ? img : (img.url || img.thumbnail || "");
        return src !== imageUrl;
      }));
    } catch (e) { alert("Failed to delete image: " + (e.message || "Unknown error")); }
  };

  const onAutoSeo = () => {
    const firstImgUrl = existingImages[0] ? resolveImageUrl(existingImages[0]) : (pendingImages[0]?.previewUrl || "");
    setForm(f => ({ ...f, ...autoGenerateSeo(f, firstImgUrl) }));
  };

  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const onGenerateWithAi = async () => {
    setAiGenerating(true);
    setAiError("");
    try {
      const draft = await generateProductContentDraft(productId);
      setForm(f => ({
        ...f,
        keyFeaturesText: draft.keyFeatures.length ? draft.keyFeatures.join("\n") : f.keyFeaturesText,
        specificationsText: Object.keys(draft.specifications).length
          ? JSON.stringify(draft.specifications, null, 2)
          : f.specificationsText,
        technicalKeywordsText: draft.technicalKeywords.length ? toCsvInput(draft.technicalKeywords) : f.technicalKeywordsText,
        customerKeywordsText: draft.customerKeywords.length ? toCsvInput(draft.customerKeywords) : f.customerKeywordsText,
        useCasesText: draft.useCases.length ? toCsvInput(draft.useCases) : f.useCasesText,
        problemStatementsText: draft.problemStatements.length ? toCsvInput(draft.problemStatements) : f.problemStatementsText,
        metaTitle: draft.metaTitle || f.metaTitle,
        metaDescription: draft.metaDescription || f.metaDescription
      }));
    } catch (e) {
      setAiError(e.message || "Failed to generate AI draft.");
    } finally {
      setAiGenerating(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError(""); setFieldErrors({});

    let specs = {};
    try {
      if (form.specificationsText.trim()) specs = JSON.parse(form.specificationsText);
    } catch {
      const fe = { specificationsText: "Invalid JSON in specifications." };
      setFieldErrors(fe); focusFirstError("specifications", fe); setSaving(false); return;
    }

    let bulkPriceSlabs, priceGroupPrices, customerSpecificPrices;
    try {
      bulkPriceSlabs = parseBulkPriceSlabs(form.bulkPriceSlabsText);
      priceGroupPrices = parseStructuredPrices(form.priceGroupPricesText, "priceGroup");
      customerSpecificPrices = parseStructuredPrices(form.customerSpecificPricesText, "customerId");
    } catch (parseErr) { setError(parseErr.message); setSaving(false); return; }

    const payload = {
      title: form.title, slug: form.slug.trim() || undefined, oldUrl: form.oldUrl,
      categoryId: form.categoryId || null, subcategoryId: form.subcategoryId || null,
      brand: form.brand, modelNumber: form.modelNumber, hsnCode: form.hsnCode,
      basePrice: Number(form.basePrice),
      salePrice: form.salePrice === "" ? undefined : Number(form.salePrice),
      shortDescription: form.shortDescription, fullDescription: form.fullDescription,
      specifications: specs,
      keyFeatures: form.keyFeaturesText.split("\n").map(s => s.trim()).filter(Boolean),
      technicalKeywords: splitCsvInput(form.technicalKeywordsText),
      customerKeywords: splitCsvInput(form.customerKeywordsText),
      useCases: splitCsvInput(form.useCasesText),
      problemStatements: splitCsvInput(form.problemStatementsText),
      moq: Number(form.moq || 1), bulkPricingEnabled: Boolean(form.bulkPricingEnabled),
      bulkPriceSlabs, priceGroupPrices, customerSpecificPrices,
      quoteRequiredAboveQty: form.quoteRequiredAboveQty === "" || form.quoteRequiredAboveQty === null ? null : Number(form.quoteRequiredAboveQty),
      deadWeightKg: Number(form.deadWeightKg || 0),
      lengthCm: form.lengthCm === "" ? null : Number(form.lengthCm),
      widthCm: form.widthCm === "" ? null : Number(form.widthCm),
      heightCm: form.heightCm === "" ? null : Number(form.heightCm),
      shippingClass: form.shippingClass,
      videos: (form.videos || []).filter(v => v.url.trim()),
      downloads: (form.downloads || []).filter(d => d.title.trim() && d.url.trim()),
      metaTitle: form.metaTitle || "", metaDescription: form.metaDescription || "",
      metaKeywords: form.metaKeywords || "",
      googleShoppingTitle: form.googleShoppingTitle,
      googleShoppingDescription: form.googleShoppingDescription,
      googleProductCategory: form.googleProductCategory,
      productType: form.productType,
      priceIncludesGst: Boolean(form.priceIncludesGst),
      shippingIncluded: Boolean(form.shippingIncluded),
      isActive: Boolean(form.isActive),
      fulfillmentType: form.fulfillmentType,
      uploadMode: form.uploadMode,
      uploadSpec: {
        cardWidthMm: form.uploadSpec.cardWidthMm === "" ? 0 : Number(form.uploadSpec.cardWidthMm),
        cardHeightMm: form.uploadSpec.cardHeightMm === "" ? 0 : Number(form.uploadSpec.cardHeightMm),
        minWidthPx: form.uploadSpec.minWidthPx === "" ? 0 : Number(form.uploadSpec.minWidthPx),
        minHeightPx: form.uploadSpec.minHeightPx === "" ? 0 : Number(form.uploadSpec.minHeightPx),
        maxFileSizeMb: Number(form.uploadSpec.maxFileSizeMb || 20),
        allowedFormats: form.uploadSpec.allowedFormats
      },
      customOptions: form.customOptions,
      printTemplates: form.printTemplates,
      stockQty: Number(form.stockQty || 0),
      reservedQty: Number(form.reservedQty || 0),
      stockStatus: form.stockStatus, allowBackorder: Boolean(form.allowBackorder),
      maxOrderQty: Number(form.maxOrderQty || 1000),
      lowStockThreshold: Number(form.lowStockThreshold || 0),
      tags: form.tags, productLabel: form.productLabel,
      relations: form.relatedProductIds.length ? { related: form.relatedProductIds } : undefined
    };

    try {
      await updateProduct(productId, payload);

      if (pendingImages.length > 0) {
        for (const { file } of pendingImages) {
          try { await uploadProductImage(productId, file); } catch { /* skip */ }
        }
        pendingImages.forEach(p => URL.revokeObjectURL(p.previewUrl));
        setPendingImages([]);
      }

      navigate("/products", { state: { notice: `Product "${form.title}" updated.` } });
    } catch (apiErr) {
      const msg = apiErr.message || "Failed to save product.";
      setError(msg);
      const lower = msg.toLowerCase();
      const fe = {};
      for (const [keyword, name] of FIELD_ERROR_MAP) { if (lower.includes(keyword)) { fe[name] = msg; break; } }
      setFieldErrors(fe); focusFirstError(msg, fe);
      document.getElementById("page-error-banner")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally { setSaving(false); }
  };

  if (!canEdit) return <div style={{ padding: 32, color: "var(--danger)" }}>You do not have permission to edit products.</div>;
  if (loading) return <div style={{ padding: 32, color: "var(--muted)" }}>Loading product…</div>;
  if (!form) return <div style={{ padding: 32, color: "var(--danger)" }}>{error || "Product not found."}</div>;

  return (
    <div style={{ padding: "24px 28px", background: "var(--bg)", minHeight: "100vh" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
        <span style={{ cursor: "pointer", color: "var(--brand)" }} onClick={() => navigate("/products")}>Products</span>
        <span style={{ margin: "0 6px" }}>›</span>
        <span style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>{productTitle}</span>
        <span style={{ margin: "0 6px" }}>›</span>
        <span>Edit</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Edit: {productTitle}</h1>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button type="submit" form="edit-product-form" className="btn btn-primary btn-small" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => navigate("/products")}>← Back</button>
        </div>
      </div>

      {error && (
        <div id="page-error-banner" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "var(--danger)", fontSize: 13, fontWeight: 500 }}>
          {error}
        </div>
      )}

      <form id="edit-product-form" onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

          {/* ── LEFT COLUMN ── */}
          <div>

            <Section title="Core Details">
              <Field label="Title" required error={fieldErrors.title}>
                <input ref={registerRef("title")} name="title" value={form.title} onChange={onFC}
                  required style={inputStyle(fieldErrors.title)} placeholder="Product title…" />
              </Field>
              <FieldRow>
                <Field label="Slug" hint="(auto-filled from title)">
                  <input ref={registerRef("slug")} name="slug" value={form.slug} onChange={onFC} style={inputStyle()} placeholder="product-slug" />
                </Field>
                <Field label="Old URL (301 redirect)">
                  <input name="oldUrl" value={form.oldUrl} onChange={onFC} style={inputStyle()} placeholder="/old-path/product" />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Brand">
                  <input ref={registerRef("brand")} name="brand" value={form.brand} onChange={onFC} style={inputStyle(fieldErrors.brand)} placeholder="Jenix, Siemens…" />
                </Field>
                <Field label="Model Number">
                  <input ref={registerRef("modelNumber")} name="modelNumber" value={form.modelNumber} onChange={onFC} style={inputStyle()} placeholder="Model / Part no." />
                </Field>
              </FieldRow>
              <FieldRow>
                <div>
                  <Field label="Category" error={fieldErrors.categoryId}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select ref={registerRef("categoryId")} name="categoryId" value={form.categoryId} onChange={onFC} style={{ ...selectStyle(fieldErrors.categoryId), flex: 1 }}>
                        <option value="">None</option>
                        {categories.filter(c => !c.parentCategoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button type="button" title="Quick create category" onClick={() => setInlineCreate(inlineCreate === "category" ? null : "category")} style={{ padding: "0 10px", fontSize: 16, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)", cursor: "pointer", color: "var(--brand)", fontWeight: 700 }}>+</button>
                    </div>
                  </Field>
                  {inlineCreate === "category" && (
                    <InlineCreate type="category" onCreated={async (id) => { const fresh = await fetchCategories({ includeInactive: true, q: "" }); setCategories(Array.isArray(fresh) ? fresh : []); if (id) set("categoryId", id); setInlineCreate(null); }} onCancel={() => setInlineCreate(null)} />
                  )}
                </div>
                <div>
                  <Field label="Subcategory">
                    <div style={{ display: "flex", gap: 6 }}>
                      <select name="subcategoryId" value={form.subcategoryId} onChange={onFC} style={{ ...selectStyle(), flex: 1 }} disabled={!form.categoryId}>
                        <option value="">None</option>
                        {subcategoryOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {form.categoryId && (
                        <button type="button" title="Quick create subcategory" onClick={() => setInlineCreate(inlineCreate === "subcategory" ? null : "subcategory")} style={{ padding: "0 10px", fontSize: 16, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)", cursor: "pointer", color: "var(--brand)", fontWeight: 700 }}>+</button>
                      )}
                    </div>
                  </Field>
                  {inlineCreate === "subcategory" && (
                    <InlineCreate type="subcategory" parentId={form.categoryId} onCreated={async (id) => { const fresh = await fetchCategories({ includeInactive: true, q: "" }); setCategories(Array.isArray(fresh) ? fresh : []); if (id) set("subcategoryId", id); setInlineCreate(null); }} onCancel={() => setInlineCreate(null)} />
                  )}
                </div>
              </FieldRow>
              <div>
                <Field label="HSN Code" required error={fieldErrors.hsnCode}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select ref={registerRef("hsnCode")} name="hsnCode" value={form.hsnCode} onChange={onFC} required style={{ ...selectStyle(fieldErrors.hsnCode), flex: 1 }}>
                      <option value="">Select HSN…</option>
                      {hsnRecords.map(h => <option key={h.hsnCode} value={h.hsnCode}>{h.hsnCode} – {h.gstRate}% – {(h.description || "").slice(0, 50)}</option>)}
                    </select>
                    <button type="button" title="Quick create HSN" onClick={() => setInlineCreate(inlineCreate === "hsn" ? null : "hsn")} style={{ padding: "0 10px", fontSize: 16, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)", cursor: "pointer", color: "var(--brand)", fontWeight: 700 }}>+</button>
                  </div>
                </Field>
                {inlineCreate === "hsn" && (
                  <InlineCreate type="hsn" onCreated={async (code) => { const fresh = await fetchHsnTaxRecords({ includeInactive: false, q: "" }); setHsnRecords(Array.isArray(fresh) ? fresh : []); set("hsnCode", code); setInlineCreate(null); }} onCancel={() => setInlineCreate(null)} />
                )}
              </div>
            </Section>

            <Section title="Pricing & Inventory">
              <FieldRow cols={3}>
                <Field label="Base Price (₹)" required error={fieldErrors.basePrice}>
                  <input ref={registerRef("basePrice")} type="number" min="0" step="0.01" name="basePrice" value={form.basePrice} onChange={onFC} required style={inputStyle(fieldErrors.basePrice)} />
                </Field>
                <Field label="Sale Price (₹)">
                  <input ref={registerRef("salePrice")} type="number" min="0" step="0.01" name="salePrice" value={form.salePrice} onChange={onFC} style={inputStyle()} />
                </Field>
                <Field label="MOQ">
                  <input ref={registerRef("moq")} type="number" min="1" name="moq" value={form.moq} onChange={onFC} style={inputStyle()} />
                </Field>
              </FieldRow>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
                <div onClick={() => set("priceIncludesGst", !form.priceIncludesGst)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${form.priceIncludesGst ? "#16a34a" : "#e5e7eb"}`, background: form.priceIncludesGst ? "#f0fdf4" : "#f9fafb", cursor: "pointer" }}>
                  <div style={{ width: 38, height: 22, borderRadius: 11, background: form.priceIncludesGst ? "#16a34a" : "#d1d5db", position: "relative", flexShrink: 0, marginTop: 2 }}>
                    <div style={{ position: "absolute", top: 3, left: form.priceIncludesGst ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: form.priceIncludesGst ? "#15803d" : "#374151" }}>{form.priceIncludesGst ? "Price includes GST" : "Price excludes GST"}</strong>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>{form.priceIncludesGst ? "GST will be extracted from the entered price" : "GST will be added on top of the entered price"}</p>
                  </div>
                </div>
                <div onClick={() => set("shippingIncluded", !form.shippingIncluded)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${form.shippingIncluded ? "#2563eb" : "#e5e7eb"}`, background: form.shippingIncluded ? "#eff6ff" : "#f9fafb", cursor: "pointer" }}>
                  <div style={{ width: 38, height: 22, borderRadius: 11, background: form.shippingIncluded ? "#2563eb" : "#d1d5db", position: "relative", flexShrink: 0, marginTop: 2 }}>
                    <div style={{ position: "absolute", top: 3, left: form.shippingIncluded ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: form.shippingIncluded ? "#1d4ed8" : "#374151" }}>{form.shippingIncluded ? "Shipping included" : "Shipping charged separately"}</strong>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>{form.shippingIncluded ? "Free shipping for this product" : "Buyer pays shipping at checkout"}</p>
                  </div>
                </div>
              </div>

              <FieldRow cols={3}>
                <Field label="Stock Qty">
                  <input ref={registerRef("stockQty")} type="number" min="0" name="stockQty" value={form.stockQty} onChange={onFC} style={inputStyle()} />
                </Field>
                <Field label="Stock Status">
                  <select name="stockStatus" value={form.stockStatus} onChange={onFC} style={selectStyle()}>
                    <option value="in_stock">In Stock</option>
                    <option value="low_stock">Low Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                    <option value="backorder">Backorder</option>
                  </select>
                </Field>
                <Field label="Max Order Qty">
                  <input type="number" min="1" name="maxOrderQty" value={form.maxOrderQty} onChange={onFC} style={inputStyle()} />
                </Field>
              </FieldRow>
              <FieldRow cols={3}>
                <Field label="Low Stock Threshold">
                  <input type="number" min="0" name="lowStockThreshold" value={form.lowStockThreshold} onChange={onFC} style={inputStyle()} />
                </Field>
                <Field label="Quote Above Qty">
                  <input type="number" min="1" name="quoteRequiredAboveQty" value={form.quoteRequiredAboveQty} onChange={onFC} style={inputStyle()} />
                </Field>
                <Field label="Reserved Qty">
                  <input type="number" min="0" name="reservedQty" value={form.reservedQty} onChange={onFC} style={inputStyle()} />
                </Field>
              </FieldRow>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="checkbox" name="bulkPricingEnabled" checked={form.bulkPricingEnabled} onChange={onFC} /> Bulk pricing enabled
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="checkbox" name="allowBackorder" checked={form.allowBackorder} onChange={onFC} /> Allow backorder
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="checkbox" name="isActive" checked={form.isActive} onChange={onFC} /> Active
                </label>
              </div>
              <Field label="Bulk Price Slabs" hint="(minQty:price, e.g. 10:2450, 25:2300)">
                <input name="bulkPriceSlabsText" value={form.bulkPriceSlabsText} onChange={onFC} style={inputStyle()} placeholder="10:2450, 25:2300" />
              </Field>
              <FieldRow>
                <Field label="Price Group Prices" hint="(group:price)">
                  <input name="priceGroupPricesText" value={form.priceGroupPricesText} onChange={onFC} style={inputStyle()} placeholder="dealer:4100, stockist:3950" />
                </Field>
                <Field label="Customer Specific Prices" hint="(customerId:price)">
                  <input name="customerSpecificPricesText" value={form.customerSpecificPricesText} onChange={onFC} style={inputStyle()} placeholder="user_abc:3890" />
                </Field>
              </FieldRow>
            </Section>

            <Section title="Shipping & Dimensions">
              <FieldRow cols={4}>
                <Field label="Weight (kg)">
                  <input ref={registerRef("deadWeightKg")} type="number" min="0" step="0.01" name="deadWeightKg" value={form.deadWeightKg} onChange={onFC} style={inputStyle(fieldErrors.deadWeightKg)} />
                </Field>
                <Field label="Length (cm)">
                  <input type="number" min="0" step="0.01" name="lengthCm" value={form.lengthCm} onChange={onFC} style={inputStyle()} />
                </Field>
                <Field label="Width (cm)">
                  <input type="number" min="0" step="0.01" name="widthCm" value={form.widthCm} onChange={onFC} style={inputStyle()} />
                </Field>
                <Field label="Height (cm)">
                  <input type="number" min="0" step="0.01" name="heightCm" value={form.heightCm} onChange={onFC} style={inputStyle()} />
                </Field>
              </FieldRow>
              <Field label="Shipping Class">
                <select name="shippingClass" value={form.shippingClass} onChange={onFC} style={inputStyle()}>
                  {shippingClasses.length === 0 && <option value="normal">Normal (default)</option>}
                  {shippingClasses.map(sc => (
                    <option key={sc.id} value={sc.code}>
                      {sc.name}{sc.rateType === "fixed" ? ` — Flat ₹${sc.fixedAmount}` : sc.baseCharge || sc.perKgRate ? ` — ₹${sc.baseCharge} + ₹${sc.perKgRate}/kg` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section title="Fulfillment Type">
              <Field label="Fulfillment Type" hint="Custom Print reveals add-on pricing + upload configuration below">
                <select name="fulfillmentType" value={form.fulfillmentType} onChange={onFC} style={selectStyle()}>
                  <option value="standard">Standard product</option>
                  <option value="custom_print">Custom Print (buyer uploads a design)</option>
                </select>
              </Field>

              {form.fulfillmentType === "custom_print" && (
                <>
                  <FieldRow>
                    <Field label="Upload Mode" hint="Single design (visiting cards) vs a bulk batch of unique designs (RFID/ID cards)">
                      <select name="uploadMode" value={form.uploadMode} onChange={onFC} style={selectStyle()}>
                        <option value="single_design">Single design per line</option>
                        <option value="unique_batch">Unique batch (one upload = one card each)</option>
                      </select>
                    </Field>
                    <Field label="Max File Size (MB)">
                      <input type="number" min="1" value={form.uploadSpec.maxFileSizeMb}
                        onChange={(e) => set("uploadSpec", { ...form.uploadSpec, maxFileSizeMb: Number(e.target.value) })}
                        style={inputStyle()} />
                    </Field>
                  </FieldRow>
                  <FieldRow cols={4}>
                    <Field label="Card Width (mm)">
                      <input type="number" min="0" value={form.uploadSpec.cardWidthMm}
                        onChange={(e) => set("uploadSpec", { ...form.uploadSpec, cardWidthMm: e.target.value === "" ? "" : Number(e.target.value) })}
                        style={inputStyle()} />
                    </Field>
                    <Field label="Card Height (mm)">
                      <input type="number" min="0" value={form.uploadSpec.cardHeightMm}
                        onChange={(e) => set("uploadSpec", { ...form.uploadSpec, cardHeightMm: e.target.value === "" ? "" : Number(e.target.value) })}
                        style={inputStyle()} />
                    </Field>
                    <Field label="Min Width (px)">
                      <input type="number" min="0" value={form.uploadSpec.minWidthPx}
                        onChange={(e) => set("uploadSpec", { ...form.uploadSpec, minWidthPx: e.target.value === "" ? "" : Number(e.target.value) })}
                        style={inputStyle()} />
                    </Field>
                    <Field label="Min Height (px)">
                      <input type="number" min="0" value={form.uploadSpec.minHeightPx}
                        onChange={(e) => set("uploadSpec", { ...form.uploadSpec, minHeightPx: e.target.value === "" ? "" : Number(e.target.value) })}
                        style={inputStyle()} />
                    </Field>
                  </FieldRow>
                  <Field label="Accepted Formats" full>
                    <div style={{ display: "flex", gap: 16 }}>
                      {["jpg", "png", "pdf"].map((fmt) => (
                        <label key={fmt} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, textTransform: "uppercase" }}>
                          <input
                            type="checkbox"
                            checked={form.uploadSpec.allowedFormats.includes(fmt)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...form.uploadSpec.allowedFormats, fmt]
                                : form.uploadSpec.allowedFormats.filter((x) => x !== fmt);
                              set("uploadSpec", { ...form.uploadSpec, allowedFormats: next });
                            }}
                          />
                          {fmt}
                        </label>
                      ))}
                    </div>
                  </Field>

                  <div style={{ margin: "16px 0 8px", fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Add-On Pricing Options
                  </div>
                  <CustomOptionsPanel
                    groups={form.customOptions}
                    templates={form.printTemplates}
                    onChange={(v) => set("customOptions", v)}
                  />

                  <div style={{ margin: "20px 0 8px", fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Print Safe-Zone Templates
                  </div>
                  <PrintTemplatesPanel
                    templates={form.printTemplates}
                    onChange={(v) => set("printTemplates", v)}
                  />
                </>
              )}
            </Section>

            <Section title={
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                Descriptions
                <button
                  type="button"
                  onClick={onGenerateWithAi}
                  disabled={aiGenerating}
                  style={{ fontSize: 12, fontWeight: 600, padding: "3px 12px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, cursor: aiGenerating ? "default" : "pointer", opacity: aiGenerating ? 0.7 : 1 }}
                >
                  {aiGenerating ? "Generating…" : "✦ Generate with AI"}
                </button>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>Drafts keywords, features, specs & SEO meta from the description above — review before saving</span>
              </div>
            }>
              {aiError ? <p className="form-error" style={{ marginTop: -4 }}>{aiError}</p> : null}
              <Field label="Short Description" hint={`(${stripHtml(form.shortDescription).length}/400)`} full noLabel>
                <RichTextEditor value={form.shortDescription} onChange={html => set("shortDescription", html)} minRows={3} placeholder="Brief product summary shown in listing cards…" />
              </Field>
              <div style={{ marginTop: 12 }}>
                <Field label="Full Description" full noLabel>
                  <RichTextEditor value={form.fullDescription} onChange={html => set("fullDescription", html)} minRows={6} placeholder="Detailed product description…" />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <FieldRow>
                  <Field label="Technical Keywords" hint="(comma separated)">
                    <input name="technicalKeywordsText" value={form.technicalKeywordsText} onChange={onFC} style={inputStyle()} placeholder="relay, 24vdc, 10a, din rail" />
                  </Field>
                  <Field label="Customer Keywords" hint="(comma separated)">
                    <input name="customerKeywordsText" value={form.customerKeywordsText} onChange={onFC} style={inputStyle()} placeholder="industrial relay, panel relay" />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Use Cases" hint="(comma separated)">
                    <input name="useCasesText" value={form.useCasesText} onChange={onFC} style={inputStyle()} />
                  </Field>
                  <Field label="Problem Statements" hint="(comma separated)">
                    <input name="problemStatementsText" value={form.problemStatementsText} onChange={onFC} style={inputStyle()} />
                  </Field>
                </FieldRow>
                <Field label="Key Features" hint="(one bullet per line — shown as highlight chips and the default product-page tab)" full>
                  <textarea name="keyFeaturesText" value={form.keyFeaturesText} onChange={onFC} rows={4} style={inputStyle()} placeholder={"IP66 waterproof housing\n2-year replacement warranty\nWorks with existing 12V wiring"} />
                </Field>
                <Field label="Specifications (JSON)" error={fieldErrors.specificationsText} full>
                  <textarea ref={registerRef("specificationsText")} name="specificationsText" value={form.specificationsText} onChange={onFC} rows={5} style={{ ...inputStyle(fieldErrors.specificationsText), fontFamily: "monospace", fontSize: 12 }} />
                </Field>
              </div>
            </Section>

            <Section title="Media">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8, textTransform: "uppercase" }}>
                  Product Images
                  {pendingImages.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "#16a34a", fontWeight: 400, textTransform: "none" }}>{pendingImages.length} queued — uploads after save</span>}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {existingImages.map((img, i) => {
                    const src = resolveImageUrl(img);
                    const rawSrc = typeof img === "string" ? img : (img.url || img.thumbnail || "");
                    return src ? (
                      <div key={i} style={{ position: "relative" }}>
                        <img src={src} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
                        <button type="button" onClick={() => removeExistingImage(rawSrc)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ef4444", color: "#fff", border: "none", fontSize: 11, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                    ) : null;
                  })}
                  {pendingImages.map((p, i) => (
                    <div key={`p${i}`} style={{ position: "relative" }}>
                      <img src={p.previewUrl} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "2px dashed #16a34a", display: "block" }} />
                      <button type="button" onClick={() => removePendingImage(i)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ef4444", color: "#fff", border: "none", fontSize: 11, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  ))}
                  <label style={{ width: 80, height: 80, borderRadius: 6, border: "2px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", fontSize: 11, gap: 4, flexShrink: 0, background: "#f9fafb" }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
                    <span>Add image</span>
                    <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { addImages(e.target.files); e.target.value = ""; }} />
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8, textTransform: "uppercase" }}>Videos</div>
                <VideoPanel videos={form.videos} onChange={v => set("videos", v)} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8, textTransform: "uppercase" }}>Files & Downloads</div>
                <DownloadsPanel downloads={form.downloads} onChange={d => set("downloads", d)} />
              </div>
            </Section>

            <Section title={
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                SEO &amp; Meta
                <button type="button" onClick={onAutoSeo} style={{ fontSize: 12, fontWeight: 600, padding: "3px 12px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
                  ✦ Auto-Generate SEO
                </button>
              </div>
            }>
              <Field label={`Meta Title (${(form.metaTitle || "").length}/60)`} error={fieldErrors.metaTitle}>
                <input ref={registerRef("metaTitle")} name="metaTitle" value={form.metaTitle} onChange={onFC} maxLength={120} style={inputStyle(fieldErrors.metaTitle)} placeholder="Product Title | Brand" />
              </Field>
              <Field label={`Meta Description (${(form.metaDescription || "").length}/155)`} error={fieldErrors.metaDescription}>
                <textarea ref={registerRef("metaDescription")} name="metaDescription" value={form.metaDescription} onChange={onFC} rows={2} maxLength={320} style={{ ...inputStyle(fieldErrors.metaDescription) }} placeholder="Brief description for Google snippet…" />
              </Field>
              <Field label="Meta Keywords" hint="(comma separated, for AI indexing)">
                <input name="metaKeywords" value={form.metaKeywords} onChange={onFC} style={inputStyle()} placeholder="relay, industrial relay, 24vdc" />
              </Field>
            </Section>

            <Section title="Google Shopping Feed">
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px" }}>Leave blank to auto-fill from title/description on export.</p>
              <Field label="Shopping Title (max 150)">
                <input name="googleShoppingTitle" value={form.googleShoppingTitle} onChange={onFC} maxLength={150} style={inputStyle()} />
              </Field>
              <Field label="Shopping Description">
                <textarea name="googleShoppingDescription" value={form.googleShoppingDescription} onChange={onFC} rows={2} style={inputStyle()} />
              </Field>
              <FieldRow>
                <Field label="Google Product Category">
                  <input name="googleProductCategory" value={form.googleProductCategory} onChange={onFC} style={inputStyle()} placeholder="Electronics > Industrial" />
                </Field>
                <Field label="Product Type">
                  <input name="productType" value={form.productType} onChange={onFC} style={inputStyle()} placeholder="Relays > Power Relays" />
                </Field>
              </FieldRow>
            </Section>

            <div style={{ display: "flex", gap: 12, paddingBottom: 32 }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: "9px 28px", fontSize: 14 }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => navigate("/products")}>Cancel</button>
            </div>

          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 14 }}>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Hand Picked Related Products</h3>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)" }}>Type a product name or SKU — select to link</p>
              <RelatedProductsPicker allProducts={allProducts} selectedIds={form.relatedProductIds} onChange={ids => set("relatedProductIds", ids)} />
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Product Tags</h3>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)" }}>Comma or Enter to add. Used for quick search recall.</p>
              <TagsInput tags={form.tags} onChange={tags => set("tags", tags)} />
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Product Label</h3>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)" }}>Badge shown on product card, e.g. "New", "Best Seller", "Sale"</p>
              <input name="productLabel" value={form.productLabel} onChange={onFC} placeholder="New Arrival, Best Seller, Hot…" style={inputStyle()} />
            </div>

            {(form.metaTitle || form.title) && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>SEO Preview</h3>
                <div style={{ padding: "10px 12px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                  <div style={{ fontSize: 14, color: "#1a0dab", fontWeight: 500, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{form.metaTitle || form.title}</div>
                  <div style={{ fontSize: 11, color: "#006621", marginBottom: 3 }}>jenixindia.com/products/…</div>
                  <div style={{ fontSize: 12, color: "#545454", lineHeight: 1.5 }}>{form.metaDescription || stripHtml(form.shortDescription).slice(0, 120) || "No description yet."}</div>
                </div>
              </div>
            )}

          </div>
        </div>
      </form>
    </div>
  );
}
