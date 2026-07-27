import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchCategories } from "../categories/categories.api";
import { fetchProducts } from "../products/products.api";
import {
  archiveBlog,
  createBlog,
  fetchBlogCategories,
  fetchBlogs,
  updateBlog,
  uploadBlogImage
} from "./blogs.api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateExcerptFromContent(content) {
  const stripped = String(content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= 220) return stripped;
  const cut = stripped.slice(0, 220);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 160 ? cut.slice(0, lastSpace) : cut) + "…";
}

function formatDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

const EMPTY_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  featuredImageUrl: "",
  ogImageUrl: "",
  youtubeUrl: "",
  categoryId: "",
  tagsText: "",
  author: "Jenix India Team",
  status: "draft",
  publishedAt: "",
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  linkedProductIds: [],
  linkedCategoryIds: [],
  relatedBlogIds: [],
  faqItemsText: "[]"
};

function formFromBlog(blog) {
  return {
    title: blog.title || "",
    slug: blog.slug || "",
    excerpt: blog.excerpt || "",
    content: blog.content || "",
    featuredImageUrl: blog.featuredImageUrl || "",
    ogImageUrl: blog.ogImageUrl || "",
    youtubeUrl: blog.youtubeUrl || "",
    categoryId: blog.categoryId || "",
    tagsText: (blog.tags || []).join(", "),
    author: blog.author || "Jenix India Team",
    status: blog.status || "draft",
    publishedAt: formatDateInput(blog.publishedAt),
    seoTitle: blog.seoTitle || "",
    seoDescription: blog.seoDescription || "",
    canonicalUrl: blog.canonicalUrl || "",
    linkedProductIds: blog.linkedProductIds || [],
    linkedCategoryIds: blog.linkedCategoryIds || [],
    relatedBlogIds: blog.relatedBlogIds || [],
    faqItemsText: JSON.stringify(blog.faqItems || [], null, 2)
  };
}

function buildPayload(form) {
  let faqItems = [];
  if (form.faqItemsText.trim()) {
    try { faqItems = JSON.parse(form.faqItemsText); } catch { faqItems = []; }
  }
  return {
    title: form.title,
    slug: form.slug.trim() || undefined,
    excerpt: form.excerpt,
    content: form.content,
    featuredImageUrl: form.featuredImageUrl,
    ogImageUrl: form.ogImageUrl,
    youtubeUrl: form.youtubeUrl,
    categoryId: form.categoryId,
    tags: form.tagsText.split(",").map((t) => t.trim()).filter(Boolean),
    author: form.author,
    status: form.status,
    publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    canonicalUrl: form.canonicalUrl,
    linkedProductIds: form.linkedProductIds,
    linkedCategoryIds: form.linkedCategoryIds,
    relatedBlogIds: form.relatedBlogIds,
    faqItems
  };
}

// ── Chip Picker ────────────────────────────────────────────────────────────────

function ChipPicker({ label, selectedIds, onAdd, onRemove, query, onQueryChange, results, getLabel, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</span>
      {selectedIds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selectedIds.map((id) => (
            <span key={id} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)",
              borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, color: "#1d4ed8"
            }}>
              {getLabel(id)}
              <button type="button" onClick={() => onRemove(id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder || "Type to search…"}
          style={{ width: "100%", padding: "6px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, boxSizing: "border-box" }}
        />
        {results.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)", marginTop: 2, maxHeight: 200, overflowY: "auto"
          }}>
            {results.map((item) => (
              <div key={item.id}
                onClick={() => { onAdd(item.id); onQueryChange(""); }}
                style={{
                  padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 2
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontWeight: 600 }}>{item.title || item.name}</span>
                {item.sku && <span style={{ fontSize: 11, color: "var(--muted)" }}>SKU: {item.sku}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Image Picker ───────────────────────────────────────────────────────────────

function ImagePicker({ label, preview, onFileChange, inputRef, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</span>
      <div style={{ border: "1.5px dashed #d1d5db", borderRadius: 10, padding: "12px 14px", background: "#f9fafb", display: "flex", alignItems: "center", gap: 12 }}>
        {preview ? (
          <img src={preview} alt="Preview"
            style={{ width: 80, height: 54, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", background: "#f3f4f6", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 80, height: 54, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e5e7eb", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <button type="button" className="btn btn-secondary"
            style={{ fontSize: 12, padding: "5px 12px" }}
            onClick={() => inputRef.current?.click()}>
            {preview ? "Replace Image" : "Choose Image"}
          </button>
          {hint && <p style={{ margin: "5px 0 0", fontSize: 11, color: "#6b7280" }}>{hint}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
    </div>
  );
}

// ── Formatting Toolbar ─────────────────────────────────────────────────────────

function FormatToolbar({ onInsert }) {
  const tools = [
    { label: "B", title: "Bold", prefix: "<strong>", suffix: "</strong>", style: { fontWeight: 700 } },
    { label: "I", title: "Italic", prefix: "<em>", suffix: "</em>", style: { fontStyle: "italic" } },
    { label: "H2", title: "Heading 2", prefix: "<h2>", suffix: "</h2>" },
    { label: "H3", title: "Heading 3", prefix: "<h3>", suffix: "</h3>" },
    { label: "• List", title: "Bullet item", prefix: "<li>", suffix: "</li>" },
    { label: "P", title: "Paragraph", prefix: "<p>", suffix: "</p>" },
    { label: "</>", title: "Code inline", prefix: "<code>", suffix: "</code>" },
  ];

  function onImageClick() {
    const url = window.prompt("Image URL (paste a link to an already-hosted image):");
    if (!url || !url.trim()) return;
    // Selected text (if any) becomes the alt text; otherwise alt is empty.
    onInsert(`<img src="${url.trim()}" alt="`, `" />`);
  }

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "6px 8px", background: "#f9fafb", border: "1px solid var(--border)", borderBottom: "none", borderRadius: "8px 8px 0 0" }}>
      {tools.map((t) => (
        <button key={t.label} type="button" title={t.title}
          onClick={() => onInsert(t.prefix, t.suffix)}
          style={{
            padding: "3px 8px", fontSize: 12, fontWeight: 600,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5,
            cursor: "pointer", color: "var(--text)", ...t.style
          }}>
          {t.label}
        </button>
      ))}
      <button type="button" title="Insert Image"
        onClick={onImageClick}
        style={{
          padding: "3px 8px", fontSize: 12, fontWeight: 600,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5,
          cursor: "pointer", color: "var(--text)"
        }}>
        🖼 Image
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function BlogsPage() {
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "blogs.create");
  const canEdit = hasPermission(session, "blogs.edit");
  const canDelete = hasPermission(session, "blogs.delete");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [blogCategories, setBlogCategories] = useState([]);
  const [catalogCategories, setCatalogCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ q: "", categoryId: "", status: "", includeArchived: true });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [featuredImageFile, setFeaturedImageFile] = useState(null);
  const [ogImageFile, setOgImageFile] = useState(null);
  const [featuredImagePreview, setFeaturedImagePreview] = useState("");
  const [ogImagePreview, setOgImagePreview] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [blogQuery, setBlogQuery] = useState("");

  const contentRef = useRef(null);
  const featuredInputRef = useRef(null);
  const ogInputRef = useRef(null);

  const blogCategoryMap = useMemo(
    () => new Map(blogCategories.map((c) => [c.id, c])),
    [blogCategories]
  );

  const filteredProducts = useMemo(() => {
    if (!productQuery.trim()) return [];
    const q = productQuery.toLowerCase();
    return products
      .filter((p) => !form.linkedProductIds.includes(p.id) &&
        (p.title?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [productQuery, products, form.linkedProductIds]);

  const filteredCategories = useMemo(() => {
    if (!categoryQuery.trim()) return [];
    const q = categoryQuery.toLowerCase();
    return catalogCategories
      .filter((c) => !form.linkedCategoryIds.includes(c.id) && c.name?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [categoryQuery, catalogCategories, form.linkedCategoryIds]);

  const filteredBlogs = useMemo(() => {
    if (!blogQuery.trim()) return [];
    const q = blogQuery.toLowerCase();
    return rows
      .filter((b) => b.id !== editingId && !form.relatedBlogIds.includes(b.id) &&
        b.title?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [blogQuery, rows, form.relatedBlogIds, editingId]);

  const getProductLabel = (id) => products.find((p) => p.id === id)?.title || id;
  const getCategoryLabel = (id) => catalogCategories.find((c) => c.id === id)?.name || id;
  const getBlogLabel = (id) => rows.find((b) => b.id === id)?.title || id;

  const loadBlogs = async (nextFilters = filters) => {
    try {
      const data = await fetchBlogs(nextFilters);
      setRows(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load blogs.");
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [blogData, blogCategoryData, categoryData, productData] = await Promise.all([
        fetchBlogs(filters),
        fetchBlogCategories(),
        fetchCategories({ includeInactive: true, q: "" }),
        fetchProducts({ includeInactive: true, q: "" })
      ]);
      setRows(Array.isArray(blogData) ? blogData : []);
      setBlogCategories(Array.isArray(blogCategoryData) ? blogCategoryData : []);
      setCatalogCategories(Array.isArray(categoryData) ? categoryData : []);
      setProducts(Array.isArray(productData) ? productData : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load blog dependencies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const resetImageState = () => {
    setFeaturedImageFile(null);
    setOgImageFile(null);
    setFeaturedImagePreview("");
    setOgImagePreview("");
    setProductQuery("");
    setCategoryQuery("");
    setBlogQuery("");
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, categoryId: blogCategories[0]?.id || "" });
    resetImageState();
    setNotice("");
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(formFromBlog(row));
    resetImageState();
    setFeaturedImagePreview(row.featuredImageUrl || "");
    setOgImagePreview(row.ogImageUrl || "");
    setNotice("");
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
    resetImageState();
  };

  const onFormChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onFeaturedImageChange = (e) => {
    const file = e.target.files?.[0] || null;
    setFeaturedImageFile(file);
    if (file) setFeaturedImagePreview(URL.createObjectURL(file));
  };

  const onOgImageChange = (e) => {
    const file = e.target.files?.[0] || null;
    setOgImageFile(file);
    if (file) setOgImagePreview(URL.createObjectURL(file));
  };

  const applyAutoExcerpt = () => {
    if (!form.content) return;
    setForm((f) => ({ ...f, excerpt: generateExcerptFromContent(f.content) }));
  };

  const applyAutoSeo = () => {
    setForm((f) => ({
      ...f,
      seoTitle: f.seoTitle || f.title,
      seoDescription: f.seoDescription || f.excerpt || generateExcerptFromContent(f.content)
    }));
  };

  const insertFormat = (prefix, suffix = "") => {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end);
    const next = ta.value.slice(0, start) + prefix + selected + suffix + ta.value.slice(end);
    setForm((f) => ({ ...f, content: next }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  };

  const addLinkedProduct = (id) => setForm((f) => ({ ...f, linkedProductIds: [...f.linkedProductIds, id] }));
  const removeLinkedProduct = (id) => setForm((f) => ({ ...f, linkedProductIds: f.linkedProductIds.filter((x) => x !== id) }));

  const addLinkedCategory = (id) => setForm((f) => ({ ...f, linkedCategoryIds: [...f.linkedCategoryIds, id] }));
  const removeLinkedCategory = (id) => setForm((f) => ({ ...f, linkedCategoryIds: f.linkedCategoryIds.filter((x) => x !== id) }));

  const addRelatedBlog = (id) => setForm((f) => ({ ...f, relatedBlogIds: [...f.relatedBlogIds, id] }));
  const removeRelatedBlog = (id) => setForm((f) => ({ ...f, relatedBlogIds: f.relatedBlogIds.filter((x) => x !== id) }));

  const onFilterSubmit = async (e) => {
    e.preventDefault();
    await loadBlogs(filters);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const payload = buildPayload(form);
      let savedId = editingId;
      if (editingId) {
        await updateBlog(editingId, payload);
      } else {
        const created = await createBlog(payload);
        savedId = created.id;
      }

      if (savedId) {
        if (featuredImageFile) {
          try { await uploadBlogImage(savedId, featuredImageFile, "featured"); } catch (imgErr) {
            setError(`Blog saved but featured image upload failed: ${imgErr.message}`);
          }
        }
        if (ogImageFile) {
          try { await uploadBlogImage(savedId, ogImageFile, "og"); } catch (imgErr) {
            setError((prev) => prev || `Blog saved but OG image upload failed: ${imgErr.message}`);
          }
        }
      }

      setNotice(editingId ? "Blog updated." : "Blog created.");
      closeModal();
      await loadBlogs(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to save blog.");
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (row) => {
    if (!window.confirm(`Archive blog "${row.title}"?`)) return;
    try {
      await archiveBlog(row.id);
      setNotice(`Blog archived: ${row.title}`);
      await loadBlogs(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to archive blog.");
    }
  };

  if (loading) return <LoadingBlock label="Loading blogs..." />;
  if (error && rows.length === 0) return <ErrorBlock message={error} onRetry={bootstrap} />;

  return (
    <section className="stack">
      <PageHeader
        title="Blogs / Knowledge Base"
        description="Content management for product education, SEO, and helpful guides."
        actions={canCreate ? (
          <button type="button" className="btn btn-primary" onClick={openCreate}>Add Blog</button>
        ) : null}
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search" placeholder="Search blog title, excerpt, tags, or author"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select value={filters.categoryId} onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}>
          <option value="">All blog categories</option>
          {blogCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <label className="inline-check">
          <input type="checkbox" checked={filters.includeArchived}
            onChange={(e) => setFilters((f) => ({ ...f, includeArchived: e.target.checked }))} />
          Include archived
        </label>
        <button type="submit" className="btn btn-secondary">Apply</button>
      </form>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>Article</th>
              <th>Category</th>
              <th>Status</th>
              <th>Published</th>
              <th>Links</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.featuredImageUrl && (
                    <img src={row.featuredImageUrl} alt={row.title}
                      style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 5, background: "#f3f4f6", float: "left", marginRight: 10 }} />
                  )}
                  <strong>{row.title}</strong>
                  <p className="row-sub">{row.excerpt}</p>
                </td>
                <td>{blogCategoryMap.get(row.categoryId)?.name || "N/A"}</td>
                <td><StatusBadge value={row.status} /></td>
                <td>{formatDateTime(row.publishedAt)}</td>
                <td>
                  <p className="row-sub">
                    {row.linkedProductsCount || 0} products / {row.linkedCategoriesCount || 0} cats
                  </p>
                </td>
                <td className="row-actions">
                  {canEdit ? <button type="button" className="btn-link" onClick={() => openEdit(row)}>Edit</button> : null}
                  {canDelete ? <button type="button" className="btn-link danger" onClick={() => onArchive(row)}>Archive</button> : null}
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
              <StatusBadge value={row.status} />
            </div>
            <p className="muted">{blogCategoryMap.get(row.categoryId)?.name || "N/A"}</p>
            <p className="muted">{formatDateTime(row.publishedAt)}</p>
            <p className="muted">{row.excerpt}</p>
            <div className="card-actions">
              {canEdit ? <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>Edit</button> : null}
              {canDelete ? <button type="button" className="btn btn-danger" onClick={() => onArchive(row)}>Archive</button> : null}
            </div>
          </article>
        ))}
      </div>

      <Modal
        title={editingId ? "Edit Blog" : "Add Blog"}
        open={modalOpen}
        onClose={closeModal}
        width="980px"
        disableOutsideClick
      >
        <form className="form-grid wide" onSubmit={onSubmit}>

          {/* ── Core ────────────────────────────────────────────────────── */}
          <h4 className="form-section">Core</h4>

          <label className="field">
            <span>Title *</span>
            <input name="title" value={form.title} onChange={onFormChange} required />
          </label>
          <label className="field">
            <span>Slug</span>
            <input name="slug" value={form.slug} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Blog Category *</span>
            <select name="categoryId" value={form.categoryId} onChange={onFormChange} required>
              <option value="">Select category</option>
              {blogCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Author</span>
            <input name="author" value={form.author} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Status</span>
            <select name="status" value={form.status} onChange={onFormChange}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="field">
            <span>Published At</span>
            <input type="datetime-local" name="publishedAt" value={form.publishedAt} onChange={onFormChange} />
          </label>

          <div className="field field-full" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Excerpt *</span>
              <button type="button" className="btn btn-secondary"
                style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={applyAutoExcerpt}>
                Generate from Content
              </button>
            </div>
            <textarea rows="3" name="excerpt" value={form.excerpt} onChange={onFormChange} required spellCheck />
          </div>

          <div className="field field-full" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Content *</span>
            </div>
            <FormatToolbar onInsert={insertFormat} />
            <textarea
              ref={contentRef}
              rows="12" name="content" value={form.content} onChange={onFormChange} required spellCheck
              style={{ borderRadius: "0 0 8px 8px", borderTop: "none", resize: "vertical", fontFamily: "inherit", fontSize: 13, padding: "8px 10px", border: "1px solid var(--border)" }}
            />
          </div>

          {/* ── SEO & Media ─────────────────────────────────────────────── */}
          <h4 className="form-section">SEO &amp; Media</h4>

          <div className="field">
            <ImagePicker
              label="Featured Image"
              preview={featuredImagePreview}
              onFileChange={onFeaturedImageChange}
              inputRef={featuredInputRef}
              hint="Recommended 1200 × 630 px — auto-converted to WebP"
            />
          </div>
          <div className="field">
            <ImagePicker
              label="OG / Social Share Image"
              preview={ogImagePreview}
              onFileChange={onOgImageChange}
              inputRef={ogInputRef}
              hint="1200 × 630 px — used for Facebook/Twitter preview"
            />
          </div>

          <label className="field field-full">
            <span>YouTube Video URL (optional)</span>
            <input
              name="youtubeUrl"
              value={form.youtubeUrl}
              onChange={onFormChange}
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
            />
          </label>

          <div className="field field-full" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>SEO Title</span>
              <button type="button" className="btn btn-secondary"
                style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={applyAutoSeo}>
                Auto-fill from Title &amp; Excerpt
              </button>
            </div>
            <input name="seoTitle" value={form.seoTitle} onChange={onFormChange} placeholder="Auto-fills from title if left blank" />
          </div>
          <label className="field field-full">
            <span>SEO Description</span>
            <textarea rows="2" name="seoDescription" value={form.seoDescription} onChange={onFormChange} placeholder="Auto-fills from excerpt if left blank" spellCheck />
          </label>
          <label className="field field-full">
            <span>Canonical URL</span>
            <input name="canonicalUrl" value={form.canonicalUrl} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>Tags (comma separated)</span>
            <input name="tagsText" value={form.tagsText} onChange={onFormChange} placeholder="e.g. industrial, iot, sensors" />
          </label>

          {/* ── Linking ─────────────────────────────────────────────────── */}
          <h4 className="form-section">Linked Products &amp; Categories</h4>

          <div className="field field-full">
            <ChipPicker
              label="Linked Products"
              selectedIds={form.linkedProductIds}
              onAdd={addLinkedProduct}
              onRemove={removeLinkedProduct}
              query={productQuery}
              onQueryChange={setProductQuery}
              results={filteredProducts}
              getLabel={getProductLabel}
              placeholder="Type product name or SKU…"
            />
          </div>

          <div className="field field-full">
            <ChipPicker
              label="Linked Categories"
              selectedIds={form.linkedCategoryIds}
              onAdd={addLinkedCategory}
              onRemove={removeLinkedCategory}
              query={categoryQuery}
              onQueryChange={setCategoryQuery}
              results={filteredCategories.map((c) => ({ ...c, title: c.name }))}
              getLabel={getCategoryLabel}
              placeholder="Type category name…"
            />
          </div>

          <div className="field field-full">
            <ChipPicker
              label="Related Blogs"
              selectedIds={form.relatedBlogIds}
              onAdd={addRelatedBlog}
              onRemove={removeRelatedBlog}
              query={blogQuery}
              onQueryChange={setBlogQuery}
              results={filteredBlogs.map((b) => ({ ...b, title: b.title }))}
              getLabel={getBlogLabel}
              placeholder="Type blog title…"
            />
          </div>

          {/* ── FAQ ─────────────────────────────────────────────────────── */}
          <h4 className="form-section">FAQ (optional)</h4>
          <label className="field field-full">
            <span>FAQ Items JSON</span>
            <textarea rows="5" name="faqItemsText" value={form.faqItemsText} onChange={onFormChange}
              style={{ fontFamily: "monospace", fontSize: 12 }} />
          </label>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Blog" : "Create Blog"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
