import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  archiveCategory,
  createCategory,
  fetchCategories,
  updateCategory,
  uploadCategoryImage
} from "./categories.api";
import { fetchProducts } from "../products/products.api";

const EMPTY_FORM = {
  name: "",
  slug: "",
  parentCategoryId: "",
  description: "",
  imageUrl: "",
  sortOrder: 0,
  isActive: true
};

const CAT_IMAGE_SIZE_HINT = "800 × 600 px recommended (JPG, PNG, WebP) — auto-converted to WebP. Max 5 MB.";

function categoryLabel(categoryMap, categoryId) {
  if (!categoryId) {
    return "Root";
  }
  return categoryMap.get(categoryId)?.name || "Unknown";
}

export function CategoriesPage() {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "categories.create");
  const canEdit = hasPermission(session, "categories.edit");
  const canDelete = hasPermission(session, "categories.delete");

  const [rows, setRows] = useState([]);
  const [productCountMap, setProductCountMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    includeInactive: true
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicateCategory, setDuplicateCategory] = useState(null);
  const imageInputRef = useRef(null);

  const categoryMap = useMemo(() => {
    return new Map(rows.map((row) => [row.id, row]));
  }, [rows]);

  const parentOptions = useMemo(() => {
    return rows.map((row) => ({
      id: row.id,
      name: row.name
    }));
  }, [rows]);

  const load = async (nextFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const [catData, productData] = await Promise.all([
        fetchCategories(nextFilters),
        fetchProducts({ includeInactive: true, q: "" })
      ]);
      setRows(Array.isArray(catData) ? catData : []);
      const countMap = {};
      for (const p of Array.isArray(productData) ? productData : []) {
        const key = p.categoryId || "__none__";
        countMap[key] = (countMap[key] || 0) + 1;
      }
      setProductCountMap(countMap);
    } catch (apiError) {
      setError(apiError.message || "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onFilterSubmit = (event) => {
    event.preventDefault();
    load(filters);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview("");
    setNotice("");
    setError("");
    setDuplicateCategory(null);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      slug: row.slug || "",
      parentCategoryId: row.parentCategoryId || "",
      description: row.description || "",
      imageUrl: row.imageUrl || "",
      sortOrder: Number(row.sortOrder || 0),
      isActive: Boolean(row.isActive)
    });
    setImageFile(null);
    setImagePreview(row.imageUrl || "");
    setNotice("");
    setError("");
    setDuplicateCategory(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
    setImageFile(null);
    setImagePreview("");
    setDuplicateCategory(null);
  };

  const onImageFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const onFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onSubmitForm = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      ...form,
      sortOrder: Number(form.sortOrder || 0),
      parentCategoryId: form.parentCategoryId || null,
      slug: form.slug.trim() || undefined
    };
    // Don't send imageUrl in the create/update payload — managed via dedicated upload
    delete payload.imageUrl;

    try {
      let savedId = editingId;
      if (editingId) {
        await updateCategory(editingId, payload);
      } else {
        const created = await createCategory(payload);
        savedId = created.id;
      }

      if (imageFile && savedId) {
        try {
          await uploadCategoryImage(savedId, imageFile);
        } catch (imgErr) {
          setError(`Category saved but image upload failed: ${imgErr.message || "unknown error"}`);
          load(filters);
          setSaving(false);
          setModalOpen(false);
          return;
        }
      }

      setNotice(editingId ? "Category updated." : "Category created.");
      closeModal();
      load(filters);
    } catch (apiError) {
      const msg = apiError.message || "";
      if (!editingId && msg.toLowerCase().includes("already exists")) {
        const existing = rows.find(
          (r) => r.name.toLowerCase() === form.name.trim().toLowerCase()
        );
        setDuplicateCategory(existing || { name: form.name.trim() });
      } else {
        setError(msg || "Failed to save category.");
      }
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (row) => {
    const confirmed = window.confirm(`Archive category "${row.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await archiveCategory(row.id);
      setNotice(`Category archived: ${row.name}`);
      load(filters);
    } catch (apiError) {
      setError(apiError.message || "Archive failed.");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading categories..." />;
  }

  if (error && rows.length === 0) {
    return <ErrorBlock message={error} onRetry={() => load(filters)} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Categories"
        description="Create and manage category hierarchy for the Phase 3 catalogue."
        actions={
          canCreate ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add Category
            </button>
          ) : null
        }
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search"
          name="q"
          placeholder="Search by name or slug"
          value={filters.q}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              q: event.target.value
            }))
          }
        />
        <label className="inline-check">
          <input
            type="checkbox"
            checked={filters.includeInactive}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                includeInactive: event.target.checked
              }))
            }
          />
          Include inactive
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
              <th>Name</th>
              <th>Slug</th>
              <th>Parent</th>
              <th>Sort</th>
              <th>Products</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const count = productCountMap[row.id] || 0;
              return (
                <tr key={row.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.imageUrl ? (
                        <img
                          src={row.imageUrl}
                          alt={row.name}
                          style={{ width: 44, height: 33, objectFit: "cover", borderRadius: 6, background: "#f3f4f6", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 44, height: 33, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
                        </div>
                      )}
                      <div>
                        <strong>{row.name}</strong>
                        {row.description ? <p className="row-sub">{row.description}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td>{row.slug}</td>
                  <td>{categoryLabel(categoryMap, row.parentCategoryId)}</td>
                  <td>{row.sortOrder}</td>
                  <td>
                    {count > 0 ? (
                      <button
                        type="button"
                        onClick={() => navigate("/products", { state: { presetCategoryId: row.id } })}
                        style={{ background: "rgba(232,35,26,0.08)", color: "#E8231A", border: "1px solid rgba(232,35,26,0.2)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        {count}
                      </button>
                    ) : (
                      <span style={{ color: "#d1d5db", fontSize: 12 }}>0</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge value={row.isActive ? "active" : "inactive"} />
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
              );
            })}
            {/* Non Categorized virtual row */}
            {(() => {
              const noneCount = productCountMap["__none__"] || 0;
              return (
                <tr style={{ background: "#fafafa" }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 44, height: 33, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      </div>
                      <div>
                        <strong style={{ color: "#9ca3af", fontStyle: "italic" }}>Non Categorised</strong>
                        <p className="row-sub" style={{ color: "#9ca3af" }}>Products with no category assigned</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: "#d1d5db" }}>—</td>
                  <td style={{ color: "#d1d5db" }}>—</td>
                  <td style={{ color: "#d1d5db" }}>—</td>
                  <td>
                    {noneCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => navigate("/products", { state: { presetCategoryId: "__none__" } })}
                        style={{ background: "rgba(245,158,11,0.1)", color: "#d97706", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        {noneCount}
                      </button>
                    ) : (
                      <span style={{ color: "#d1d5db", fontSize: 12 }}>0</span>
                    )}
                  </td>
                  <td><StatusBadge value="inactive" /></td>
                  <td></td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {rows.map((row) => {
          const count = productCountMap[row.id] || 0;
          return (
            <article key={row.id} className="card">
              <div className="card-head">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt={row.name} style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 6, background: "#f3f4f6" }} />
                ) : null}
                <h4 style={{ flex: 1 }}>{row.name}</h4>
                <StatusBadge value={row.isActive ? "active" : "inactive"} />
              </div>
              <p className="muted">{row.slug}</p>
              <p className="muted">Parent: {categoryLabel(categoryMap, row.parentCategoryId)}</p>
              <p className="muted">Sort: {row.sortOrder}</p>
              {count > 0 ? (
                <button type="button" onClick={() => navigate("/products", { state: { presetCategoryId: row.id } })}
                  style={{ background: "rgba(232,35,26,0.08)", color: "#E8231A", border: "1px solid rgba(232,35,26,0.2)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 4 }}>
                  {count} products
                </button>
              ) : (
                <p className="muted">0 products</p>
              )}
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
          );
        })}
        {/* Non Categorised mobile card */}
        {(() => {
          const noneCount = productCountMap["__none__"] || 0;
          return (
            <article className="card" style={{ background: "#fafafa", opacity: 0.85 }}>
              <div className="card-head">
                <h4 style={{ flex: 1, color: "#9ca3af", fontStyle: "italic" }}>Non Categorised</h4>
              </div>
              <p className="muted">Products with no category assigned</p>
              {noneCount > 0 ? (
                <button type="button" onClick={() => navigate("/products", { state: { presetCategoryId: "__none__" } })}
                  style={{ background: "rgba(245,158,11,0.1)", color: "#d97706", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {noneCount} products
                </button>
              ) : (
                <p className="muted">0 products</p>
              )}
            </article>
          );
        })()}
      </div>

      <Modal
        title={editingId ? "Edit Category" : "Add Category"}
        open={modalOpen}
        onClose={closeModal}
        disableOutsideClick
      >
        {duplicateCategory ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
            <div style={{
              background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.4)",
              borderRadius: 8, padding: "14px 16px"
            }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                "{duplicateCategory.name}" already exists.
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                A category with this name already exists. Would you like to edit the existing one, or exit?
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {duplicateCategory.id && canEdit ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => openEdit(duplicateCategory)}
                >
                  Edit Existing
                </button>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Exit
              </button>
            </div>
          </div>
        ) : (
        <form className="form-grid" onSubmit={onSubmitForm}>
          <label className="field">
            <span>Name *</span>
            <input name="name" value={form.name} onChange={onFormChange} required />
          </label>

          <label className="field">
            <span>Slug</span>
            <input name="slug" value={form.slug} onChange={onFormChange} />
          </label>

          <label className="field">
            <span>Parent Category</span>
            <select
              name="parentCategoryId"
              value={form.parentCategoryId}
              onChange={onFormChange}
            >
              <option value="">Root</option>
              {parentOptions
                .filter((option) => option.id !== editingId)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="field">
            <span>Sort Order</span>
            <input
              type="number"
              min="0"
              name="sortOrder"
              value={form.sortOrder}
              onChange={onFormChange}
            />
          </label>

          <label className="field field-full">
            <span>Description</span>
            <textarea
              name="description"
              rows="3"
              value={form.description}
              onChange={onFormChange}
            />
          </label>

          <div className="field field-full" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Category Image</span>
            <div
              style={{
                border: "1.5px dashed #d1d5db", borderRadius: 10, padding: "14px 16px",
                background: "#f9fafb", display: "flex", flexDirection: "column", gap: 10
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f3f4f6" }}
                  />
                ) : (
                  <div style={{ width: 80, height: 60, borderRadius: 8, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e5e7eb" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: 13, padding: "6px 14px" }}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {imagePreview ? "Replace Image" : "Choose Image"}
                  </button>
                  {imageFile ? (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#16a34a" }}>
                      ✓ {imageFile.name}
                    </p>
                  ) : null}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                📐 {CAT_IMAGE_SIZE_HINT}
              </p>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onImageFileChange}
            />
          </div>

          <label className="inline-check">
            <input
              type="checkbox"
              name="isActive"
              checked={form.isActive}
              onChange={onFormChange}
            />
            Active
          </label>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Category" : "Create Category"}
            </button>
          </div>
        </form>
        )}
      </Modal>
    </section>
  );
}
