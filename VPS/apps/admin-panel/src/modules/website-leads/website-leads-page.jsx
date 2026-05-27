import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchWebsiteLeads, updateWebsiteLead } from "./website-leads.api";

const EMPTY_FORM = {
  status: "new",
  notes: ""
};

const STATUS_OPTIONS = [
  "new",
  "contacted",
  "demo_scheduled",
  "proposal_sent",
  "converted",
  "not_interested",
  "closed"
];

export function WebsiteLeadsPage() {
  const { session } = useAuthSession();
  const canEdit = hasPermission(session, "website_leads.edit");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    limit: 50
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadRows = async (nextFilters = filters) => {
    try {
      const data = await fetchWebsiteLeads(nextFilters);
      setRows(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load website leads.");
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchWebsiteLeads(filters);
      setRows(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load website leads.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const onFilterSubmit = async (event) => {
    event.preventDefault();
    await loadRows(filters);
  };

  const openEdit = (lead) => {
    setEditingLead(lead);
    setForm({
      status: lead.status || "new",
      notes: lead.notes || ""
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingLead(null);
    setSaving(false);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!editingLead) {
      return;
    }

    setSaving(true);
    setNotice("");
    setError("");

    try {
      await updateWebsiteLead(editingLead.id, form);
      setNotice(`Lead updated: ${editingLead.businessName}`);
      closeModal();
      await loadRows(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to update website lead.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading website leads..." />;
  }

  if (error && rows.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Website Buyer Leads"
        description="Phase 15 demo-webapp enquiries captured from the public storefront."
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search"
          placeholder="Search name, business, city, email, mobile, or source page"
          value={filters.q}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              q: event.target.value
            }))
          }
        />
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
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
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
              <th>Lead</th>
              <th>Business</th>
              <th>Source</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <p className="row-sub">{row.mobile} / {row.email}</p>
                </td>
                <td>
                  <strong>{row.businessName}</strong>
                  <p className="row-sub">{row.businessType} - {row.city}</p>
                </td>
                <td>
                  <p className="row-sub">{row.sourcePage}</p>
                  <p className="row-sub">{row.currentWebsite || "No website provided"}</p>
                </td>
                <td>
                  <StatusBadge value={row.status} />
                </td>
                <td>{formatDateTime(row.createdAt)}</td>
                <td className="row-actions">
                  {canEdit ? (
                    <button type="button" className="btn-link" onClick={() => openEdit(row)}>
                      Update
                    </button>
                  ) : (
                    <span className="row-sub">View only</span>
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
              <h4>{row.businessName}</h4>
              <StatusBadge value={row.status} />
            </div>
            <p className="muted">{row.name}</p>
            <p className="muted">{row.mobile} / {row.email}</p>
            <p className="muted">{row.businessType} - {row.city}</p>
            <p className="muted">Source: {row.sourcePage}</p>
            <p className="muted">{formatDateTime(row.createdAt)}</p>
            {canEdit ? (
              <div className="card-actions">
                <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>
                  Update
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <Modal
        title={editingLead ? `Update Lead - ${editingLead.businessName}` : "Update Lead"}
        open={modalOpen}
        onClose={closeModal}
        width="720px"
      >
        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>Status</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value
                }))
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-full">
            <span>Notes</span>
            <textarea
              rows="8"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value
                }))
              }
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Lead"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
