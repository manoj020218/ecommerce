import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import {
  formatCurrencyInr,
  formatDateTime,
  formatNumber
} from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  fetchPaymentGatewayConfig,
  fetchPaymentGateways,
  updatePaymentGatewayConfig
} from "./payment-gateways.api";

function stringifyJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

function parseJsonObject(value, label) {
  if (!String(value || "").trim()) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (_error) {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed;
}

function formatGatewayLimits(gateway) {
  const minValue = formatCurrencyInr(gateway.minOrderValue || 0);
  if (gateway.maxOrderValue === null || gateway.maxOrderValue === undefined) {
    return `${minValue} and above`;
  }
  return `${minValue} - ${formatCurrencyInr(gateway.maxOrderValue)}`;
}

function summarizeInstructions(instructions) {
  const values = Object.values(instructions || {}).filter(Boolean);
  if (!values.length) {
    return "No instructions configured";
  }
  return values.slice(0, 2).join(" | ");
}

const EMPTY_GATEWAY_FORM = {
  label: "",
  isEnabled: true,
  priority: "100",
  mode: "test",
  minOrderValue: "0",
  maxOrderValue: "",
  credentialsText: "{}",
  instructionsText: "{}"
};

export function PaymentGatewaysPage() {
  const { session } = useAuthSession();
  const canManage = hasPermission(session, "payments.verify_manual");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gateways, setGateways] = useState([]);
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [gatewayForm, setGatewayForm] = useState(EMPTY_GATEWAY_FORM);
  const [modalOpen, setModalOpen] = useState(false);

  const metrics = useMemo(() => {
    const onlineGateways = gateways.filter((gateway) => gateway.gatewayType === "online");
    const manualRows = gateways.filter((gateway) => gateway.gatewayType === "manual");
    return {
      total: gateways.length,
      onlineEnabled: onlineGateways.filter((gateway) => gateway.isEnabled).length,
      manualEnabled: manualRows.filter((gateway) => gateway.isEnabled).length,
      configuredCredentials: gateways.filter((gateway) => gateway.credentialsConfigured).length
    };
  }, [gateways]);

  const loadAll = async () => {
    setError("");
    const data = await fetchPaymentGateways();
    const rows = Array.isArray(data?.gateways) ? data.gateways : [];
    setGateways(rows);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadAll();
    } catch (requestError) {
      setError(requestError.message || "Failed to load payment gateways.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const closeModal = () => {
    setModalOpen(false);
    setSelectedGateway(null);
    setGatewayForm(EMPTY_GATEWAY_FORM);
    setDetailLoading(false);
    setSaving(false);
  };

  const openGatewayModal = async (gateway) => {
    if (!canManage) {
      return;
    }

    setModalOpen(true);
    setDetailLoading(true);
    setSelectedGateway(gateway);
    setError("");
    setNotice("");

    try {
      const detail = await fetchPaymentGatewayConfig(gateway.code);
      setSelectedGateway(detail);
      setGatewayForm({
        label: detail.label || "",
        isEnabled: Boolean(detail.isEnabled),
        priority: String(detail.priority ?? 100),
        mode: detail.mode || "test",
        minOrderValue: String(detail.minOrderValue ?? 0),
        maxOrderValue:
          detail.maxOrderValue === null || detail.maxOrderValue === undefined
            ? ""
            : String(detail.maxOrderValue),
        credentialsText: stringifyJson(detail.credentials),
        instructionsText: stringifyJson(detail.instructions)
      });
    } catch (requestError) {
      setError(requestError.message || "Failed to load gateway configuration.");
      closeModal();
    } finally {
      setDetailLoading(false);
    }
  };

  const onSubmitGateway = async (event) => {
    event.preventDefault();
    if (!selectedGateway || !canManage) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const credentials = parseJsonObject(gatewayForm.credentialsText, "Credentials");
      const instructions = parseJsonObject(gatewayForm.instructionsText, "Instructions");

      await updatePaymentGatewayConfig(selectedGateway.code, {
        label: gatewayForm.label,
        isEnabled: gatewayForm.isEnabled,
        priority: Number(gatewayForm.priority || 100),
        mode: gatewayForm.mode,
        minOrderValue: Number(gatewayForm.minOrderValue || 0),
        maxOrderValue: gatewayForm.maxOrderValue === "" ? null : Number(gatewayForm.maxOrderValue),
        credentials,
        instructions
      });

      setNotice(`Payment gateway updated: ${gatewayForm.label}`);
      await loadAll();
      closeModal();
    } catch (requestError) {
      setError(requestError.message || "Failed to update payment gateway.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading payment gateways..." />;
  }

  if (error && gateways.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Payment Gateways"
        description="Control online and manual payment methods, gateway priority, order-amount rules, and direct payment discounts."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Total Gateways</p>
          <h3>{formatNumber(metrics.total)}</h3>
          <span>Online and manual payment options in the store</span>
        </article>
        <article className="summary-card">
          <p>Online Enabled</p>
          <h3>{formatNumber(metrics.onlineEnabled)}</h3>
          <span>Live checkout options for payment collection</span>
        </article>
        <article className="summary-card">
          <p>Manual Enabled</p>
          <h3>{formatNumber(metrics.manualEnabled)}</h3>
          <span>UPI and bank-transfer methods available to buyers</span>
        </article>
        <article className="summary-card">
          <p>Credentials Configured</p>
          <h3>{formatNumber(metrics.configuredCredentials)}</h3>
          <span>Gateways that already have credential objects saved</span>
        </article>
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <p className="muted" style={{ fontSize: 13 }}>
        Direct payment discounts have moved to{" "}
        <a href="/discounts" style={{ color: "var(--brand)", fontWeight: 600 }}>Discounts &amp; Coupons</a>.
      </p>

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>Gateway</th>
              <th>Type</th>
              <th>Availability</th>
              <th>Config</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {gateways.map((gateway) => (
              <tr key={gateway.id}>
                <td>
                  <strong>{gateway.label}</strong>
                  <p className="row-sub">{gateway.code}</p>
                </td>
                <td>
                  <StatusBadge
                    value={gateway.gatewayType}
                    label={gateway.gatewayType === "manual" ? "Manual" : "Online"}
                  />
                </td>
                <td>
                  <StatusBadge value={gateway.isEnabled ? "enabled" : "disabled"} />
                  <p className="row-sub">{gateway.mode}</p>
                </td>
                <td>
                  <p className="row-sub">Priority: {gateway.priority}</p>
                  <p className="row-sub">Order range: {formatGatewayLimits(gateway)}</p>
                  <p className="row-sub">
                    Credentials: {gateway.credentialsConfigured ? "Configured" : "Missing"}
                  </p>
                  <p className="row-sub">{summarizeInstructions(gateway.instructions)}</p>
                </td>
                <td>{formatDateTime(gateway.updatedAt)}</td>
                <td className="row-actions">
                  {canManage ? (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => openGatewayModal(gateway)}
                    >
                      Edit
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
        {gateways.map((gateway) => (
          <article key={gateway.id} className="card">
            <div className="card-head">
              <h4>{gateway.label}</h4>
              <StatusBadge value={gateway.isEnabled ? "enabled" : "disabled"} />
            </div>
            <p className="muted">{gateway.code}</p>
            <p className="muted">
              {gateway.gatewayType === "manual" ? "Manual" : "Online"} / {gateway.mode}
            </p>
            <p className="muted">Priority: {gateway.priority}</p>
            <p className="muted">Order range: {formatGatewayLimits(gateway)}</p>
            <p className="muted">
              Credentials: {gateway.credentialsConfigured ? "Configured" : "Missing"}
            </p>
            <p className="muted">{summarizeInstructions(gateway.instructions)}</p>
            {canManage ? (
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openGatewayModal(gateway)}
                >
                  Edit Gateway
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <Modal
        title={selectedGateway ? `Edit Gateway - ${selectedGateway.label}` : "Edit Gateway"}
        open={modalOpen}
        onClose={closeModal}
        width="960px"
      >
        {detailLoading ? (
          <LoadingBlock label="Loading gateway configuration..." />
        ) : (
          <form className="stack" onSubmit={onSubmitGateway}>
            <div className="form-grid wide">
              <label className="field">
                <span>Label</span>
                <input
                  value={gatewayForm.label}
                  onChange={(event) =>
                    setGatewayForm((current) => ({
                      ...current,
                      label: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Mode</span>
                <select
                  value={gatewayForm.mode}
                  onChange={(event) =>
                    setGatewayForm((current) => ({
                      ...current,
                      mode: event.target.value
                    }))
                  }
                >
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </select>
              </label>
              <label className="field">
                <span>Priority</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={gatewayForm.priority}
                  onChange={(event) =>
                    setGatewayForm((current) => ({
                      ...current,
                      priority: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Minimum Order Value</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={gatewayForm.minOrderValue}
                  onChange={(event) =>
                    setGatewayForm((current) => ({
                      ...current,
                      minOrderValue: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Maximum Order Value</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Leave blank for no maximum"
                  value={gatewayForm.maxOrderValue}
                  onChange={(event) =>
                    setGatewayForm((current) => ({
                      ...current,
                      maxOrderValue: event.target.value
                    }))
                  }
                />
              </label>
              <div className="field">
                <span>Status</span>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={gatewayForm.isEnabled}
                    onChange={(event) =>
                      setGatewayForm((current) => ({
                        ...current,
                        isEnabled: event.target.checked
                      }))
                    }
                  />
                  <span>Enable this gateway</span>
                </label>
              </div>
              <label className="field field-full">
                <span>Credentials JSON</span>
                <textarea
                  rows="8"
                  value={gatewayForm.credentialsText}
                  onChange={(event) =>
                    setGatewayForm((current) => ({
                      ...current,
                      credentialsText: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field field-full">
                <span>Instructions JSON</span>
                <textarea
                  rows="8"
                  value={gatewayForm.instructionsText}
                  onChange={(event) =>
                    setGatewayForm((current) => ({
                      ...current,
                      instructionsText: event.target.value
                    }))
                  }
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Gateway"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
