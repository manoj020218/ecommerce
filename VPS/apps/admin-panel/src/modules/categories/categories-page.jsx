import { useEffect, useMemo, useState } from "react";
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
  updateCategory
} from "./categories.api";

const EMPTY_FORM = {
  name: "",
  slug: "",
  parentCategoryId: "",
  description: "",
  imageUrl: "",
  sortOrder: 0,
  isActive: true
};

function categoryLabel(categoryMap, categoryId) {
  if (!categoryId) {
    return "Root";
  }
  return categoryMap.get(categoryId)?.name || "Unknown";
}

export function CategoriesPage() {
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "categories.create");
  const canEdit = hasPermission(session, "categories.edit");
  const canDelete = hasPermission(session, "categories.delete");

  const [rows, setRows] = useState([]);
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
  const [saving, setSaving] = useState(false);

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
      const data = await fetchCategories(nextFilters);
      setRows(Array.isArray(data) ? data : []);
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
    setNotice("");
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
    setNotice("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
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

    try {
      if (editingId) {
        await updateCategory(editingId, payload);
        setNotice("Category updated.");
      } else {
        await createCategory(payload);
        setNotice("Category created.");
      }

      closeModal();
      load(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to save category.");
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
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  {row.description ? <p className="row-sub">{row.description}</p> : null}
                </td>
                <td>{row.slug}</td>
                <td>{categoryLabel(categoryMap, row.parentCategoryId)}</td>
                <td>{row.sortOrder}</td>
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
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {rows.map((row) => (
          <article key={row.id} className="card">
            <div className="card-head">
              <h4>{row.name}</h4>
              <StatusBadge value={row.isActive ? "active" : "inactive"} />
            </div>
            <p className="muted">{row.slug}</p>
            <p className="muted">Parent: {categoryLabel(categoryMap, row.parentCategoryId)}</p>
            <p className="muted">Sort: {row.sortOrder}</p>
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
        title={editingId ? "Edit Category" : "Add Category"}
        open={modalOpen}
        onClose={closeModal}
      >
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

          <label className="field field-full">
            <span>Image URL</span>
            <input name="imageUrl" value={form.imageUrl} onChange={onFormChange} />
          </label>

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
      </Modal>
    </section>
  );
}
