import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../shared/api/http-client";

const BRAND = "#E8231A";
const DARK = "#111827";

const BASE = "/admin/pages";
const BANNERS_BASE = "/admin/settings/hero-banners";

function apiFetchBanners() { return apiFetch(BANNERS_BASE, { auth: true }); }
function apiSaveBanners(slides) { return apiFetch(BANNERS_BASE, { method: "PUT", auth: true, body: { slides } }); }
function apiUploadBannerImage(slideId, imageType, file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch(`${BANNERS_BASE}/upload/${slideId}/${imageType}`, { method: "POST", auth: true, body: fd });
}

function newSlideId() {
  return `slide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function BannerSlideRow({ slide, onChange, onDelete, onUpload, uploadingKey }) {
  const desktopInputRef = useRef(null);
  const mobileInputRef = useRef(null);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "grid", gap: 14, background: "#fafafa" }}>
      {/* Image upload row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Desktop Image
            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>1920 × 600 px (JPG/PNG/WebP)</span>
          </div>
          {slide.desktopImageUrl ? (
            <img src={slide.desktopImageUrl} alt="Desktop banner" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginBottom: 6, border: "1px solid #e5e7eb" }} />
          ) : (
            <div style={{ width: "100%", height: 80, background: "#f3f4f6", borderRadius: 6, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #d1d5db", fontSize: 12, color: "#9ca3af" }}>
              No image
            </div>
          )}
          <input ref={desktopInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) onUpload(slide.id, "desktop", e.target.files[0]); }} />
          <button
            onClick={() => desktopInputRef.current?.click()}
            disabled={uploadingKey === `${slide.id}-desktop`}
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontFamily: "inherit" }}
          >
            {uploadingKey === `${slide.id}-desktop` ? "Uploading…" : "Upload Desktop"}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Mobile Image
            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>768 × 400 px (JPG/PNG/WebP)</span>
          </div>
          {slide.mobileImageUrl ? (
            <img src={slide.mobileImageUrl} alt="Mobile banner" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginBottom: 6, border: "1px solid #e5e7eb" }} />
          ) : (
            <div style={{ width: "100%", height: 80, background: "#f3f4f6", borderRadius: 6, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #d1d5db", fontSize: 12, color: "#9ca3af" }}>
              No image
            </div>
          )}
          <input ref={mobileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) onUpload(slide.id, "mobile", e.target.files[0]); }} />
          <button
            onClick={() => mobileInputRef.current?.click()}
            disabled={uploadingKey === `${slide.id}-mobile`}
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontFamily: "inherit" }}
          >
            {uploadingKey === `${slide.id}-mobile` ? "Uploading…" : "Upload Mobile"}
          </button>
        </div>
      </div>

      {/* Text fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input
          value={slide.title || ""}
          onChange={(e) => onChange({ ...slide, title: e.target.value })}
          placeholder="Slide headline (optional)"
          style={{ padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
        />
        <input
          value={slide.subtitle || ""}
          onChange={(e) => onChange({ ...slide, subtitle: e.target.value })}
          placeholder="Sub-headline (optional)"
          style={{ padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
        />
        <input
          value={slide.linkUrl || ""}
          onChange={(e) => onChange({ ...slide, linkUrl: e.target.value })}
          placeholder="CTA link URL e.g. /products or /categories/cctv"
          style={{ padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
        />
        <input
          value={slide.linkLabel || ""}
          onChange={(e) => onChange({ ...slide, linkLabel: e.target.value })}
          placeholder="CTA button label e.g. Shop Now"
          style={{ padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
        />
      </div>

      {/* Active + Delete row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={slide.isActive !== false}
            onChange={(e) => onChange({ ...slide, isActive: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: BRAND }}
          />
          Active (visible on storefront)
        </label>
        <button
          onClick={() => onDelete(slide.id)}
          style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "1px solid #fee2e2", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#ef4444", fontFamily: "inherit" }}
        >
          Remove Slide
        </button>
      </div>
    </div>
  );
}

function HeroBannerSection() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetchBanners()
      .then((data) => setSlides(Array.isArray(data?.slides) ? data.slides : []))
      .catch((e) => setError(e.message || "Failed to load banners."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiSaveBanners(slides);
      setNotice("Hero banners saved.");
    } catch (e) {
      setError(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (slideId, imageType, file) => {
    setUploadingKey(`${slideId}-${imageType}`);
    setError("");
    try {
      const result = await apiUploadBannerImage(slideId, imageType, file);
      setSlides((prev) =>
        prev.map((s) =>
          s.id === slideId
            ? { ...s, [imageType === "desktop" ? "desktopImageUrl" : "mobileImageUrl"]: result.url }
            : s
        )
      );
      setNotice(`${imageType} image uploaded.`);
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setUploadingKey("");
    }
  };

  const handleChange = (updated) => {
    setSlides((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleDelete = (id) => {
    setSlides((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAdd = () => {
    setSlides((prev) => [
      ...prev,
      { id: newSlideId(), desktopImageUrl: "", mobileImageUrl: "", title: "", subtitle: "", linkUrl: "", linkLabel: "", isActive: true }
    ]);
  };

  return (
    <div style={{ marginBottom: 32, padding: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: DARK }}>Hero Banner Slides</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7280" }}>
            Upload banner images shown at the top of the home page. If no slides are active, the default text hero is shown.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleAdd}
            style={{ padding: "8px 16px", background: "#f3f4f6", color: DARK, border: 0, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            + Add Slide
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "8px 16px", background: BRAND, color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}
          >
            {saving ? "Saving…" : "Save Banners"}
          </button>
        </div>
      </div>

      {notice ? <div style={{ background: "#ecfdf3", border: "1px solid #a7f3d0", borderRadius: 8, padding: "8px 12px", color: "#065f46", fontSize: 13, marginBottom: 12 }}>{notice}</div> : null}
      {error ? <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{error}</div> : null}

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontSize: 13 }}>Loading…</div>
      ) : slides.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontSize: 13, border: "1px dashed #e5e7eb", borderRadius: 10 }}>
          No slides yet. Click "+ Add Slide" to create the first banner.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {slides.map((slide) => (
            <BannerSlideRow
              key={slide.id}
              slide={slide}
              onChange={handleChange}
              onDelete={handleDelete}
              onUpload={handleUpload}
              uploadingKey={uploadingKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function apiFetchPages() { return apiFetch(BASE, { auth: true }); }
function apiFetchPage(id) { return apiFetch(`${BASE}/${id}`, { auth: true }); }
function apiCreatePage(body) { return apiFetch(BASE, { method: "POST", auth: true, body }); }
function apiUpdatePage(id, body) { return apiFetch(`${BASE}/${id}`, { method: "PUT", auth: true, body }); }
function apiDeletePage(id) { return apiFetch(`${BASE}/${id}`, { method: "DELETE", auth: true }); }

const EMPTY_FORM = {
  title: "",
  slug: "",
  metaTitle: "",
  metaDescription: "",
  content: "",
  isPublished: true,
  showInFooter: false
};

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function StatusBadge({ isPublished }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      background: isPublished ? "#ecfdf3" : "#f3f4f6",
      color: isPublished ? "#047857" : "#6b7280"
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: isPublished ? "#10b981" : "#9ca3af",
        display: "inline-block"
      }} />
      {isPublished ? "Published" : "Draft"}
    </span>
  );
}

function PageEditor({ page, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(page ? {
    title: page.title || "",
    slug: page.slug || "",
    metaTitle: page.metaTitle || "",
    metaDescription: page.metaDescription || "",
    content: page.content || "",
    isPublished: page.isPublished !== false,
    showInFooter: page.showInFooter === true
  } : EMPTY_FORM);

  const [autoSlug, setAutoSlug] = useState(!page);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Page Title *
          </label>
          <input
            value={form.title}
            onChange={(e) => {
              set("title", e.target.value);
              if (autoSlug) set("slug", slugify(e.target.value));
            }}
            placeholder="e.g. About Us"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            URL Slug *
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>/pages/</span>
            <input
              value={form.slug}
              onChange={(e) => { setAutoSlug(false); set("slug", e.target.value); }}
              placeholder="about-us"
              style={{ flex: 1, padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Meta Title (SEO)
          </label>
          <input
            value={form.metaTitle}
            onChange={(e) => set("metaTitle", e.target.value)}
            placeholder={form.title || "Page title for search engines"}
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Meta Description (SEO)
          </label>
          <input
            value={form.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
            placeholder="Short description for search engines (max 160 chars)"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
          Page Content (HTML supported)
        </label>
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
          Use basic HTML: &lt;h2&gt; &lt;h3&gt; &lt;p&gt; &lt;ul&gt; &lt;li&gt; &lt;strong&gt; &lt;a href=""&gt; &lt;br&gt;
        </div>
        <textarea
          value={form.content}
          onChange={(e) => set("content", e.target.value)}
          rows={18}
          placeholder="<h2>Heading</h2>&#10;<p>Paragraph text...</p>"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "monospace",
            resize: "vertical",
            lineHeight: 1.6,
            color: "#111827"
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => set("isPublished", e.target.checked)}
            style={{ width: 16, height: 16, accentColor: BRAND }}
          />
          Published (visible to buyers)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={form.showInFooter}
            onChange={(e) => set("showInFooter", e.target.checked)}
            style={{ width: 16, height: 16, accentColor: BRAND }}
          />
          Show link in Footer
        </label>
      </div>

      {error ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          style={{ padding: "10px 20px", background: BRAND, color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}
        >
          {saving ? "Saving…" : (page ? "Save Changes" : "Create Page")}
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "10px 20px", background: "#f3f4f6", color: "#374151", border: 0, borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function WebBuilderPage() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingPage, setEditingPage] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const loadPages = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetchPages();
      setPages(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load pages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPages(); }, []);

  const handleSave = async (form) => {
    setSaving(true);
    setSaveError("");
    try {
      if (editingPage) {
        await apiUpdatePage(editingPage.id, form);
        setNotice(`"${form.title}" updated.`);
      } else {
        await apiCreatePage(form);
        setNotice(`"${form.title}" created.`);
      }
      setEditingPage(null);
      setCreating(false);
      loadPages();
    } catch (e) {
      setSaveError(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiDeletePage(id);
      setDeleteConfirmId(null);
      setNotice("Page deleted.");
      loadPages();
    } catch (e) {
      setError(e.message || "Delete failed.");
    }
  };

  const handleTogglePublish = async (page) => {
    try {
      await apiUpdatePage(page.id, { isPublished: !page.isPublished });
      setNotice(`"${page.title}" ${page.isPublished ? "unpublished" : "published"}.`);
      loadPages();
    } catch (e) {
      setError(e.message || "Update failed.");
    }
  };

  if (creating || editingPage) {
    return (
      <div style={{ padding: "24px 28px", maxWidth: 900 }}>
        <button
          onClick={() => { setCreating(false); setEditingPage(null); setSaveError(""); }}
          style={{ marginBottom: 20, background: "none", border: "none", color: BRAND, fontWeight: 600, fontSize: 14, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
        >
          ← Back to Pages
        </button>
        <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: DARK }}>
          {editingPage ? `Edit: ${editingPage.title}` : "New Page"}
        </h2>
        <PageEditor
          page={editingPage}
          onSave={handleSave}
          onCancel={() => { setCreating(false); setEditingPage(null); setSaveError(""); }}
          saving={saving}
          error={saveError}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px" }}>
      <HeroBannerSection />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: DARK }}>Web Builder</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            Manage static pages: About Us, Privacy Policy, Shipping Policy, and custom pages.
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setSaveError(""); setNotice(""); }}
          style={{ padding: "10px 18px", background: BRAND, color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
        >
          + New Page
        </button>
      </div>

      {notice ? (
        <div style={{ background: "#ecfdf3", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 14px", color: "#065f46", fontSize: 13, marginBottom: 16 }}>
          {notice}
        </div>
      ) : null}
      {error ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#b91c1c", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Loading pages…</div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" }}>Title</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" }}>URL Slug</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" }}>Status</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" }}>Footer</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" }}>Type</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#374151" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page, index) => (
                <tr key={page.id} style={{ borderBottom: index < pages.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: DARK }}>{page.title}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, color: "#374151" }}>
                      /pages/{page.slug}
                    </code>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusBadge isPublished={page.isPublished} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 12, color: page.showInFooter ? "#047857" : "#9ca3af" }}>
                      {page.showInFooter ? "✓ Yes" : "No"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      {page.isDefault ? "Default" : "Custom"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => { setEditingPage(page); setSaveError(""); setNotice(""); }}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151", fontFamily: "inherit" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleTogglePublish(page)}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: page.isPublished ? "#b45309" : "#047857", fontFamily: "inherit" }}
                      >
                        {page.isPublished ? "Unpublish" : "Publish"}
                      </button>
                      {!page.isDefault ? (
                        deleteConfirmId === page.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(page.id)}
                              style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700, border: 0, borderRadius: 6, background: "#fef2f2", cursor: "pointer", color: "#b91c1c", fontFamily: "inherit" }}
                            >
                              Confirm Delete
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151", fontFamily: "inherit" }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(page.id)}
                            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "1px solid #fee2e2", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#ef4444", fontFamily: "inherit" }}
                          >
                            Delete
                          </button>
                        )
                      ) : (
                        <span style={{ fontSize: 11, color: "#d1d5db", padding: "5px 12px" }}>Protected</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              No pages yet. Click "+ New Page" to create one.
            </div>
          ) : null}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 13, color: "#92400e" }}>
        <strong>Google Login:</strong> To enable Google Sign-In for buyers, you need a Google Cloud Project with OAuth 2.0 credentials. See the Integrations page or ask your developer to configure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in the server environment.
      </div>
    </div>
  );
}
