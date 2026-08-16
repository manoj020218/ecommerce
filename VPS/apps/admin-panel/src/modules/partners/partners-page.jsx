import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchPartners, createPartner } from "./partners.api";

const DEFAULT_FORM = {
  name: "",
  commissionRatePercent: "5",
  attributionWindowDays: "7",
  returnUrl: ""
};

export function PartnersPage() {
  const { session } = useAuthSession();
  const canManage = hasPermission(session, "partners.manage");
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partners, setPartners] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      setPartners(await fetchPartners());
    } catch (apiError) {
      setError(apiError.message || "Failed to load partners.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  function openCreate() {
    setForm(DEFAULT_FORM);
    setFormError("");
    setCreateOpen(true);
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const created = await createPartner({
        name: form.name.trim(),
        commissionRatePercent: Number(form.commissionRatePercent),
        attributionWindowDays: Number(form.attributionWindowDays),
        returnUrl: form.returnUrl.trim()
      });
      setCreateOpen(false);
      navigate(`/partners/${created.id}`);
    } catch (apiError) {
      setFormError(apiError.message || "Failed to create partner.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading partners..." />;
  }

  if (error && !partners.length) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Partner Feeds"
        description="Give third-party platforms a scoped product feed with a Buy Now link back to the storefront, and track referral commissions."
        actions={
          canManage ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              + New Partner
            </button>
          ) : null
        }
      />

      {error ? <p className="form-error">{error}</p> : null}

      {!partners.length ? (
        <EmptyBlock
          title="No partners yet."
          description="Add a partner to generate their scoped feed URL and Buy Now tracking code."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Commission</th>
                <th>Products</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr
                  key={partner.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/partners/${partner.id}`)}
                >
                  <td>{partner.name}</td>
                  <td>{partner.code}</td>
                  <td>{partner.commissionRatePercent}%</td>
                  <td>{partner.productIds?.length || 0}</td>
                  <td>
                    <StatusBadge value={partner.isActive === false ? "inactive" : "active"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="New Partner" open={createOpen} onClose={() => setCreateOpen(false)}>
        <form className="form-grid" onSubmit={handleCreate}>
          <label className="field">
            <span>Partner Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>Commission %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.commissionRatePercent}
              onChange={(event) =>
                setForm({ ...form, commissionRatePercent: event.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>Attribution Window (days)</span>
            <input
              type="number"
              min="1"
              max="90"
              value={form.attributionWindowDays}
              onChange={(event) =>
                setForm({ ...form, attributionWindowDays: event.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>Return URL (partner's site, for the "Back to Partner" link)</span>
            <input
              type="url"
              placeholder="https://partner-site.com"
              value={form.returnUrl}
              onChange={(event) => setForm({ ...form, returnUrl: event.target.value })}
            />
          </label>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Creating..." : "Create Partner"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
