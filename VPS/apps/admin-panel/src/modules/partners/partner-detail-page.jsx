import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchProducts } from "../products/products.api";
import {
  fetchPartner,
  updatePartner,
  deletePartner,
  regeneratePartnerApiKey,
  assignPartnerProducts,
  fetchPartnerCommissions,
  markCommissionPaid
} from "./partners.api";

function buildFeedUrl(code, apiKey) {
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4100/api").replace(
    /\/$/,
    ""
  );
  return `${apiBase}/partner-feed/${code}?key=${apiKey}`;
}

export function PartnerDetailPage() {
  const { partnerId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canManage = hasPermission(session, "partners.manage");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [partner, setPartner] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    commissionRatePercent: "",
    attributionWindowDays: "",
    returnUrl: "",
    isActive: true
  });

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [partnerData, commissionData, productData] = await Promise.all([
        fetchPartner(partnerId),
        fetchPartnerCommissions(partnerId),
        fetchProducts({})
      ]);
      setPartner(partnerData);
      setCommissions(commissionData);
      setAllProducts(Array.isArray(productData) ? productData : []);
      setSelectedProductIds(partnerData.productIds || []);
      setForm({
        name: partnerData.name || "",
        commissionRatePercent: String(partnerData.commissionRatePercent ?? ""),
        attributionWindowDays: String(partnerData.attributionWindowDays ?? ""),
        returnUrl: partnerData.returnUrl || "",
        isActive: partnerData.isActive !== false
      });
    } catch (apiError) {
      setError(apiError.message || "Failed to load partner.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter((product) =>
      String(product.title || "").toLowerCase().includes(q)
    );
  }, [allProducts, productQuery]);

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updatePartner(partnerId, {
        name: form.name.trim(),
        commissionRatePercent: Number(form.commissionRatePercent),
        attributionWindowDays: Number(form.attributionWindowDays),
        returnUrl: form.returnUrl.trim(),
        isActive: form.isActive
      });
      setPartner(updated);
      setNotice("Settings saved.");
    } catch (apiError) {
      setError(apiError.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateKey() {
    setSaving(true);
    setError("");
    try {
      const updated = await regeneratePartnerApiKey(partnerId);
      setPartner(updated);
      setNotice("API key regenerated. The old feed URL will stop working immediately.");
    } catch (apiError) {
      setError(apiError.message || "Failed to regenerate API key.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete partner "${partner.name}"? This cannot be undone.`)) {
      return;
    }
    setSaving(true);
    try {
      await deletePartner(partnerId);
      navigate("/partners");
    } catch (apiError) {
      setError(apiError.message || "Failed to delete partner.");
      setSaving(false);
    }
  }

  function toggleProduct(productId) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  async function handleSaveProducts() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await assignPartnerProducts(partnerId, selectedProductIds);
      setPartner(updated);
      setNotice(`${updated.productIds.length} product(s) assigned to this partner's feed.`);
    } catch (apiError) {
      setError(apiError.message || "Failed to assign products.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(ledgerId) {
    const note = window.prompt("Payout note (optional):", "") || "";
    setSaving(true);
    try {
      await markCommissionPaid(ledgerId, note);
      setCommissions(await fetchPartnerCommissions(partnerId));
    } catch (apiError) {
      setError(apiError.message || "Failed to mark commission paid.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading partner..." />;
  }

  if (error && !partner) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  const feedUrl = buildFeedUrl(partner.code, partner.apiKey);

  return (
    <section className="stack">
      <PageHeader
        title={partner.name}
        description={`Tracking code: ${partner.code}`}
        actions={
          canManage ? (
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              Delete Partner
            </button>
          ) : null
        }
      />

      {notice ? <p className="form-success">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <h3 className="subsection-title">Settings</h3>
        <form className="form-grid" onSubmit={handleSaveSettings}>
          <label className="field">
            <span>Partner Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              maxLength={120}
              disabled={!canManage}
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
              disabled={!canManage}
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
              disabled={!canManage}
            />
          </label>
          <label className="field">
            <span>Return URL</span>
            <input
              type="url"
              value={form.returnUrl}
              onChange={(event) => setForm({ ...form, returnUrl: event.target.value })}
              disabled={!canManage}
            />
          </label>
          <label className="field field-checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              disabled={!canManage}
            />
            <span>Active (feed and Buy Now links work while active)</span>
          </label>

          <div className="field">
            <span>Feed URL (give this to the partner)</span>
            <div className="copy-row">
              <input value={feedUrl} readOnly />
              <button
                type="button"
                className="btn"
                onClick={() => navigator.clipboard?.writeText(feedUrl)}
              >
                Copy
              </button>
            </div>
          </div>

          {canManage ? (
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={handleRegenerateKey}
                disabled={saving}
              >
                Regenerate API Key
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          ) : null}
        </form>
      </section>

      <section className="summary-card">
        <h3 className="subsection-title">
          Assigned Products ({selectedProductIds.length})
        </h3>
        <input
          placeholder="Search products..."
          value={productQuery}
          onChange={(event) => setProductQuery(event.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      disabled={!canManage}
                    />
                  </td>
                  <td>{product.title}</td>
                  <td className="muted">{product.sku || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveProducts}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Product Assignment"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="summary-card">
        <h3 className="subsection-title">Commission Ledger</h3>
        {!commissions.length ? (
          <p className="muted">No orders attributed to this partner yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Base</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {commissions.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.createdAt)}</td>
                    <td>{entry.orderNo}</td>
                    <td>₹{entry.commissionBase.toLocaleString("en-IN")}</td>
                    <td>{entry.commissionRatePercent}%</td>
                    <td>₹{entry.commissionAmount.toLocaleString("en-IN")}</td>
                    <td>
                      <StatusBadge value={entry.status} />
                    </td>
                    <td>
                      {entry.status === "pending" && canManage ? (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => handleMarkPaid(entry.id)}
                          disabled={saving}
                        >
                          Mark Paid
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
