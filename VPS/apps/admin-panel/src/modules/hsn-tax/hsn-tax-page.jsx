import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  archiveHsnTaxRecord,
  createHsnTaxRecord,
  fetchHsnTaxRecords,
  updateHsnTaxRecord
} from "./hsn-tax.api";
import { fetchProducts } from "../products/products.api";

const EMPTY_FORM = {
  hsnCode: "",
  description: "",
  gstRate: 18,
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 18,
  effectiveFrom: "",
  isActive: true
};

function toDateInput(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function HsnTaxPage() {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "hsn_tax.create");
  const canEdit = hasPermission(session, "hsn_tax.edit");
  const canDelete = hasPermission(session, "hsn_tax.delete");

  const [rows, setRows] = useState([]);
  const [productCountMap, setProductCountMap] = useState({});
  const [missingHsnCount, setMissingHsnCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    includeInactive: true
  });
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [duplicateHsn, setDuplicateHsn] = useState(null); // existing record if HSN code already taken

  const load = async (nextFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const [hsnData, productData] = await Promise.all([
        fetchHsnTaxRecords(nextFilters),
        fetchProducts({ includeInactive: true, q: "" })
      ]);
      setRows(Array.isArray(hsnData) ? hsnData : []);
      const countMap = {};
      let missing = 0;
      for (const p of Array.isArray(productData) ? productData : []) {
        if (!p.hsnCode) { missing++; }
        else { countMap[p.hsnCode] = (countMap[p.hsnCode] || 0) + 1; }
      }
      setProductCountMap(countMap);
      setMissingHsnCount(missing);
    } catch (apiError) {
      setError(apiError.message || "Failed to load HSN records.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortTh = ({ col, label, style = {} }) => {
    const active = sortCol === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        style={{ cursor: "pointer", userSelect: "none", color: active ? "#E8231A" : undefined, whiteSpace: "nowrap", ...style }}
      >
        {label} {active ? (sortDir === "asc" ? "▲" : "▼") : <span style={{ opacity: 0.3 }}>⇅</span>}
      </th>
    );
  };

  const displayRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let av, bv;
      if (sortCol === "hsn")    { av = a.hsnCode || ""; bv = b.hsnCode || ""; }
      else if (sortCol === "desc")   { av = (a.description || "").toLowerCase(); bv = (b.description || "").toLowerCase(); }
      else if (sortCol === "gst")    { av = Number(a.gstRate || 0); bv = Number(b.gstRate || 0); }
      else if (sortCol === "cgst")   { av = Number(a.cgstRate || 0); bv = Number(b.cgstRate || 0); }
      else if (sortCol === "sgst")   { av = Number(a.sgstRate || 0); bv = Number(b.sgstRate || 0); }
      else if (sortCol === "igst")   { av = Number(a.igstRate || 0); bv = Number(b.igstRate || 0); }
      else if (sortCol === "date")   { av = a.effectiveFrom || ""; bv = b.effectiveFrom || ""; }
      else if (sortCol === "products") { av = productCountMap[a.hsnCode] || 0; bv = productCountMap[b.hsnCode] || 0; }
      else { av = ""; bv = ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortCol, sortDir, productCountMap]);

  useEffect(() => {
    load();
  }, []);

  const onFilterSubmit = (event) => {
    event.preventDefault();
    load(filters);
  };

  const openCreate = () => {
    setEditingCode(null);
    setDuplicateHsn(null);
    setForm({
      ...EMPTY_FORM,
      effectiveFrom: new Date().toISOString().slice(0, 10)
    });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingCode(row.hsnCode);
    setForm({
      hsnCode: row.hsnCode,
      description: row.description || "",
      gstRate: Number(row.gstRate || 0),
      cgstRate: Number(row.cgstRate || 0),
      sgstRate: Number(row.sgstRate || 0),
      igstRate: Number(row.igstRate || 0),
      effectiveFrom: toDateInput(row.effectiveFrom),
      isActive: Boolean(row.isActive)
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
    setDuplicateHsn(null);
  };

  const onFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));

    // Live duplicate check only in create mode on the hsnCode field
    if (name === "hsnCode" && !editingCode) {
      const normalized = value.trim().toUpperCase();
      const found = rows.find((r) => r.hsnCode === normalized);
      setDuplicateHsn(found || null);
    }
  };

  const switchToEdit = (row) => {
    openEdit(row);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      ...form,
      gstRate: Number(form.gstRate || 0),
      cgstRate: Number(form.cgstRate || 0),
      sgstRate: Number(form.sgstRate || 0),
      igstRate: Number(form.igstRate || 0),
      effectiveFrom: form.effectiveFrom
    };

    try {
      if (editingCode) {
        await updateHsnTaxRecord(editingCode, payload);
        setNotice(`HSN updated: ${editingCode}`);
      } else {
        await createHsnTaxRecord(payload);
        setNotice(`HSN created: ${payload.hsnCode}`);
      }
      closeModal();
      load(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to save HSN record.");
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (row) => {
    const confirmed = window.confirm(`Archive HSN code ${row.hsnCode}?`);
    if (!confirmed) {
      return;
    }

    try {
      await archiveHsnTaxRecord(row.hsnCode);
      setNotice(`HSN archived: ${row.hsnCode}`);
      load(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to archive HSN.");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading HSN tax records..." />;
  }

  if (error && rows.length === 0) {
    return <ErrorBlock message={error} onRetry={() => load(filters)} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="HSN / Tax Master"
        description="Maintain GST and split tax rates used by product records."
        actions={
          canCreate ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add HSN Record
            </button>
          ) : null
        }
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search"
          placeholder="Search HSN code or description"
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

      {missingHsnCount > 0 && (
        <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <svg width="16" height="16" fill="none" stroke="#d97706" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>
            {missingHsnCount} product{missingHsnCount !== 1 ? "s" : ""} have no HSN code assigned
          </span>
          <button
            type="button"
            onClick={() => navigate("/products", { state: { presetCategoryId: "" } })}
            style={{ fontSize: 12, fontWeight: 600, color: "#d97706", background: "none", border: "1px solid #fde68a", borderRadius: 8, padding: "4px 12px", cursor: "pointer", marginLeft: "auto" }}
          >
            View products → assign HSN
          </button>
        </div>
      )}

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <SortTh col="hsn" label="HSN" />
              <SortTh col="desc" label="Description" />
              <SortTh col="gst" label="GST" />
              <SortTh col="cgst" label="CGST" />
              <SortTh col="sgst" label="SGST" />
              <SortTh col="igst" label="IGST" />
              <SortTh col="date" label="Effective From" />
              <SortTh col="products" label="Products" />
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const count = productCountMap[row.hsnCode] || 0;
              return (
                <tr key={row.hsnCode}>
                  <td>
                    <strong>{row.hsnCode}</strong>
                  </td>
                  <td>{row.description}</td>
                  <td>{row.gstRate}%</td>
                  <td>{row.cgstRate}%</td>
                  <td>{row.sgstRate}%</td>
                  <td>{row.igstRate}%</td>
                  <td>{formatDateTime(row.effectiveFrom)}</td>
                  <td>
                    {count > 0 ? (
                      <button
                        type="button"
                        onClick={() => navigate("/products", { state: { presetHsnCode: row.hsnCode } })}
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
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {displayRows.map((row) => {
          const count = productCountMap[row.hsnCode] || 0;
          return (
          <article key={row.hsnCode} className="card">
            <div className="card-head">
              <h4>{row.hsnCode}</h4>
              <StatusBadge value={row.isActive ? "active" : "inactive"} />
            </div>
            <p>{row.description}</p>
            <p className="muted">
              GST {row.gstRate}% | CGST {row.cgstRate}% | SGST {row.sgstRate}% | IGST{" "}
              {row.igstRate}%
            </p>
            <p className="muted">Effective: {formatDateTime(row.effectiveFrom)}</p>
            {count > 0 ? (
              <button type="button" onClick={() => navigate("/products", { state: { presetHsnCode: row.hsnCode } })}
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
      </div>

      <Modal
        title={editingCode ? `Edit HSN ${editingCode}` : "Add HSN Record"}
        open={modalOpen}
        onClose={closeModal}
        disableOutsideClick
      >
        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>HSN Code *</span>
            <input
              name="hsnCode"
              value={form.hsnCode}
              onChange={onFormChange}
              disabled={Boolean(editingCode)}
              required
              style={duplicateHsn ? { borderColor: "#f59e0b", background: "#fffbeb" } : {}}
            />
          </label>

          {duplicateHsn && (
            <div style={{
              gridColumn: "1 / -1",
              background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8,
              padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
            }}>
              <span style={{ fontSize: 13 }}>
                <strong>⚠ HSN {duplicateHsn.hsnCode}</strong> already exists — {duplicateHsn.gstRate}% GST · {duplicateHsn.description}
              </span>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => switchToEdit(duplicateHsn)}
                >
                  Edit existing
                </button>
                <button
                  type="button"
                  className="btn-link"
                  style={{ fontSize: 12 }}
                  onClick={() => setDuplicateHsn(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <label className="field field-full">
            <span>Description *</span>
            <input
              name="description"
              value={form.description}
              onChange={onFormChange}
              required
            />
          </label>

          <label className="field">
            <span>GST % *</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              name="gstRate"
              value={form.gstRate}
              onChange={onFormChange}
              required
            />
          </label>

          <label className="field">
            <span>CGST % *</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              name="cgstRate"
              value={form.cgstRate}
              onChange={onFormChange}
              required
            />
          </label>

          <label className="field">
            <span>SGST % *</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              name="sgstRate"
              value={form.sgstRate}
              onChange={onFormChange}
              required
            />
          </label>

          <label className="field">
            <span>IGST % *</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              name="igstRate"
              value={form.igstRate}
              onChange={onFormChange}
              required
            />
          </label>

          <label className="field">
            <span>Effective From *</span>
            <input
              type="date"
              name="effectiveFrom"
              value={form.effectiveFrom}
              onChange={onFormChange}
              required
            />
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
            <button type="submit" className="btn btn-primary" disabled={saving || Boolean(duplicateHsn)}>
              {saving ? "Saving..." : editingCode ? "Update Record" : "Create Record"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
