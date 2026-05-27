import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime, splitCsvInput, toCsvInput } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchCategories } from "../categories/categories.api";
import { fetchProducts } from "../products/products.api";
import {
  archiveBlog,
  createBlog,
  fetchBlogCategories,
  fetchBlogs,
  updateBlog
} from "./blogs.api";

const EMPTY_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  featuredImageUrl: "",
  categoryId: "",
  tagsText: "",
  author: "Jenix India Team",
  status: "draft",
  publishedAt: "",
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  ogImageUrl: "",
  linkedProductIdsText: "",
  linkedCategoryIdsText: "",
  relatedBlogIdsText: "",
  faqItemsText: "[]"
};

function formatDateInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function formFromBlog(blog) {
  return {
    title: blog.title || "",
    slug: blog.slug || "",
    excerpt: blog.excerpt || "",
    content: blog.content || "",
    featuredImageUrl: blog.featuredImageUrl || "",
    categoryId: blog.categoryId || "",
    tagsText: toCsvInput(blog.tags),
    author: blog.author || "Jenix India Team",
    status: blog.status || "draft",
    publishedAt: formatDateInput(blog.publishedAt),
    seoTitle: blog.seoTitle || "",
    seoDescription: blog.seoDescription || "",
    canonicalUrl: blog.canonicalUrl || "",
    ogImageUrl: blog.ogImageUrl || "",
    linkedProductIdsText: toCsvInput(blog.linkedProductIds),
    linkedCategoryIdsText: toCsvInput(blog.linkedCategoryIds),
    relatedBlogIdsText: toCsvInput(blog.relatedBlogIds),
    faqItemsText: JSON.stringify(blog.faqItems || [], null, 2)
  };
}

function buildPayload(form) {
  let faqItems = [];
  if (form.faqItemsText.trim()) {
    faqItems = JSON.parse(form.faqItemsText);
  }

  return {
    title: form.title,
    slug: form.slug.trim() || undefined,
    excerpt: form.excerpt,
    content: form.content,
    featuredImageUrl: form.featuredImageUrl,
    categoryId: form.categoryId,
    tags: splitCsvInput(form.tagsText),
    author: form.author,
    status: form.status,
    publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    canonicalUrl: form.canonicalUrl,
    ogImageUrl: form.ogImageUrl,
    linkedProductIds: splitCsvInput(form.linkedProductIdsText),
    linkedCategoryIds: splitCsvInput(form.linkedCategoryIdsText),
    relatedBlogIds: splitCsvInput(form.relatedBlogIdsText),
    faqItems
  };
}

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
  const [filters, setFilters] = useState({
    q: "",
    categoryId: "",
    status: "",
    includeArchived: true
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const blogCategoryMap = useMemo(
    () => new Map(blogCategories.map((category) => [category.id, category])),
    [blogCategories]
  );

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
      setForm((current) => ({
        ...current,
        categoryId: current.categoryId || blogCategoryData?.[0]?.id || ""
      }));
    } catch (apiError) {
      setError(apiError.message || "Failed to load blog dependencies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const productReference = useMemo(() => {
    return products.slice(0, 12).map((product) => `${product.id} - ${product.title}`).join("\n");
  }, [products]);

  const categoryReference = useMemo(() => {
    return catalogCategories
      .slice(0, 12)
      .map((category) => `${category.id} - ${category.name}`)
      .join("\n");
  }, [catalogCategories]);

  const relatedBlogReference = useMemo(() => {
    return rows.slice(0, 12).map((blog) => `${blog.id} - ${blog.title}`).join("\n");
  }, [rows]);

  const onFilterSubmit = async (event) => {
    event.preventDefault();
    await loadBlogs(filters);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      categoryId: blogCategories[0]?.id || ""
    });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(formFromBlog(row));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
  };

  const onFormChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");

    try {
      const payload = buildPayload(form);
      if (editingId) {
        await updateBlog(editingId, payload);
        setNotice("Blog updated.");
      } else {
        await createBlog(payload);
        setNotice("Blog created.");
      }
      closeModal();
      await loadBlogs(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to save blog.");
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (row) => {
    const confirmed = window.confirm(`Archive blog "${row.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await archiveBlog(row.id);
      setNotice(`Blog archived: ${row.title}`);
      await loadBlogs(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to archive blog.");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading blogs..." />;
  }

  if (error && rows.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Blogs / Knowledge Base"
        description="Phase 13 content management for product education, SEO, and helpful guides."
        actions={
          canCreate ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add Blog
            </button>
          ) : null
        }
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search"
          placeholder="Search blog title, excerpt, tags, or author"
          value={filters.q}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              q: event.target.value
            }))
          }
        />
        <select
          value={filters.categoryId}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              categoryId: event.target.value
            }))
          }
        >
          <option value="">All blog categories</option>
          {blogCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value
            }))
          }
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                includeArchived: event.target.checked
              }))
            }
          />
          Include archived
        </label>
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
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
                  <strong>{row.title}</strong>
                  <p className="row-sub">{row.excerpt}</p>
                </td>
                <td>{blogCategoryMap.get(row.categoryId)?.name || row.category?.name || "N/A"}</td>
                <td>
                  <StatusBadge value={row.status} />
                </td>
                <td>{formatDateTime(row.publishedAt)}</td>
                <td>
                  <p className="row-sub">
                    {row.linkedProductsCount} products / {row.linkedCategoriesCount} categories
                  </p>
                </td>
                <td className="row-actions">
                  {canEdit ? (
                    <button type="button" className="btn-link" onClick={() => openEdit(row)}>
                      Edit
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button type="button" className="btn-link danger" onClick={() => onArchive(row)}>
                      Archive
                    </button>
                  ) : null}
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
            <p className="muted">{blogCategoryMap.get(row.categoryId)?.name || row.category?.name || "N/A"}</p>
            <p className="muted">{formatDateTime(row.publishedAt)}</p>
            <p className="muted">{row.excerpt}</p>
            <div className="card-actions">
              {canEdit ? (
                <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" className="btn btn-danger" onClick={() => onArchive(row)}>
                  Archive
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <Modal
        title={editingId ? "Edit Blog" : "Add Blog"}
        open={modalOpen}
        onClose={closeModal}
        width="980px"
      >
        <form className="form-grid wide" onSubmit={onSubmit}>
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
              {blogCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
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
            <input
              type="datetime-local"
              name="publishedAt"
              value={form.publishedAt}
              onChange={onFormChange}
            />
          </label>

          <label className="field field-full">
            <span>Excerpt *</span>
            <textarea rows="3" name="excerpt" value={form.excerpt} onChange={onFormChange} required />
          </label>
          <label className="field field-full">
            <span>Content *</span>
            <textarea rows="10" name="content" value={form.content} onChange={onFormChange} required />
          </label>

          <h4 className="form-section">SEO & Media</h4>
          <label className="field">
            <span>Featured Image URL</span>
            <input name="featuredImageUrl" value={form.featuredImageUrl} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>OG Image URL</span>
            <input name="ogImageUrl" value={form.ogImageUrl} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>SEO Title</span>
            <input name="seoTitle" value={form.seoTitle} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>SEO Description</span>
            <textarea rows="3" name="seoDescription" value={form.seoDescription} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>Canonical URL</span>
            <input name="canonicalUrl" value={form.canonicalUrl} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>Tags (comma separated)</span>
            <input name="tagsText" value={form.tagsText} onChange={onFormChange} />
          </label>

          <h4 className="form-section">Linking & FAQ</h4>
          <label className="field field-full">
            <span>Linked Product IDs (comma separated)</span>
            <textarea rows="2" name="linkedProductIdsText" value={form.linkedProductIdsText} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>Linked Category IDs (comma separated)</span>
            <textarea rows="2" name="linkedCategoryIdsText" value={form.linkedCategoryIdsText} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>Related Blog IDs (comma separated)</span>
            <textarea rows="2" name="relatedBlogIdsText" value={form.relatedBlogIdsText} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>FAQ Items JSON</span>
            <textarea rows="6" name="faqItemsText" value={form.faqItemsText} onChange={onFormChange} />
          </label>

          <label className="field field-full">
            <span>Product reference</span>
            <textarea rows="4" value={productReference} readOnly />
          </label>
          <label className="field field-full">
            <span>Category reference</span>
            <textarea rows="4" value={categoryReference} readOnly />
          </label>
          <label className="field field-full">
            <span>Related blog reference</span>
            <textarea rows="4" value={relatedBlogReference} readOnly />
          </label>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Blog" : "Create Blog"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
