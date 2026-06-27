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

const BRAND = "#E8231A";

const CREDENTIAL_FIELDS = {
  razorpay: [
    { key: "keyId", label: "Key ID", placeholder: "rzp_test_... or rzp_live_..." },
    { key: "keySecret", label: "Key Secret", type: "password", placeholder: "Leave blank to keep existing" },
    { key: "webhookSecret", label: "Webhook Secret", type: "password", placeholder: "Leave blank to keep existing" }
  ],
  cashfree: [
    { key: "appId", label: "App ID", placeholder: "Your Cashfree App ID" },
    { key: "secretKey", label: "Secret Key", type: "password", placeholder: "Leave blank to keep existing" },
    { key: "webhookSecret", label: "Webhook Secret", type: "password", placeholder: "Leave blank to keep existing" }
  ]
};

function stringifyJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

function parseJsonObject(value, label) {
  if (!String(value || "").trim()) return {};
  let parsed;
  try { parsed = JSON.parse(value); } catch (_e) {
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
  if (!values.length) return "No instructions configured";
  return values.slice(0, 2).join(" | ");
}

function GatewayTypeBadge({ code }) {
  const colors = {
    razorpay:   { bg: "#dbeafe", text: "#1d4ed8" },
    cashfree:   { bg: "#dcfce7", text: "#15803d" },
    phonepe:    { bg: "#f3e8ff", text: "#7c3aed" },
    payu:       { bg: "#fef3c7", text: "#92400e" },
    ccavenue:   { bg: "#ffedd5", text: "#c2410c" },
    paytm:      { bg: "#f3f4f6", text: "#374151" },
    mock_online:{ bg: "#f3f4f6", text: "#9ca3af" },
    manual_upi: { bg: "#ecfdf5", text: "#047857" },
    direct_bank_transfer: { bg: "#eff6ff", text: "#1d4ed8" },
    cod:        { bg: "#f9fafb", text: "#6b7280" }
  };
  const c = colors[code] || { bg: "#f3f4f6", text: "#374151" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, background: c.bg, color: c.text,
      textTransform: "uppercase", letterSpacing: "0.04em"
    }}>
      {code.replace(/_/g, " ")}
    </span>
  );
}

const EMPTY_GATEWAY_FORM = {
  label: "", isEnabled: true, priority: "100", mode: "test",
  minOrderValue: "0", maxOrderValue: "",
  credentialsText: "{}", instructionsText: "{}"
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
  const [credentialForm, setCredentialForm] = useState({});
  const [modalOpen, setModalOpen] = useState(false);

  const metrics = useMemo(() => {
    const online = gateways.filter(g => g.gatewayType === "online");
    const manual = gateways.filter(g => g.gatewayType === "manual");
    return {
      total: gateways.length,
      onlineEnabled: online.filter(g => g.isEnabled).length,
      manualEnabled: manual.filter(g => g.isEnabled).length,
      configuredCredentials: gateways.filter(g => g.credentialsConfigured).length
    };
  }, [gateways]);

  const loadAll = async () => {
    setError("");
    const data = await fetchPaymentGateways();
    setGateways(Array.isArray(data?.gateways) ? data.gateways : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try { await loadAll(); } catch (e) { setError(e.message || "Failed to load payment gateways."); }
    finally { setLoading(false); }
  };

  useEffect(() => { bootstrap(); }, []);

  const closeModal = () => {
    setModalOpen(false);
    setSelectedGateway(null);
    setGatewayForm(EMPTY_GATEWAY_FORM);
    setCredentialForm({});
    setDetailLoading(false);
    setSaving(false);
  };

  const openGatewayModal = async (gateway) => {
    if (!canManage) return;
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
        maxOrderValue: detail.maxOrderValue === null || detail.maxOrderValue === undefined ? "" : String(detail.maxOrderValue),
        credentialsText: stringifyJson(detail.credentials),
        instructionsText: stringifyJson(detail.instructions)
      });
      const fields = CREDENTIAL_FIELDS[detail.code];
      if (fields) {
        const creds = detail.credentials || {};
        const initial = {};
        for (const f of fields) { initial[f.key] = creds[f.key] || ""; }
        setCredentialForm(initial);
      }
    } catch (e) {
      setError(e.message || "Failed to load gateway configuration.");
      closeModal();
    } finally {
      setDetailLoading(false);
    }
  };

  const onSubmitGateway = async (e) => {
    e.preventDefault();
    if (!selectedGateway || !canManage) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      let credentials;
      const fields = CREDENTIAL_FIELDS[selectedGateway.code];
      if (fields) {
        const existing = selectedGateway.credentials || {};
        credentials = { ...existing };
        for (const f of fields) {
          const val = credentialForm[f.key];
          if (val !== "" && val !== undefined) {
            credentials[f.key] = val;
          }
        }
      } else {
        credentials = parseJsonObject(gatewayForm.credentialsText, "Credentials");
      }

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
    } catch (e) {
      setError(e.message || "Failed to update payment gateway.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading payment gateways..." />;
  if (error && gateways.length === 0) return <ErrorBlock message={error} onRetry={bootstrap} />;

  const hasSmartFields = selectedGateway && CREDENTIAL_FIELDS[selectedGateway.code];

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 }}>Payment Gateways</h1>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0" }}>
            Online and manual payment methods, priority, order-amount rules
          </p>
        </div>
        <button
          type="button"
          onClick={bootstrap}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {/* stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Gateways", value: metrics.total, sub: "Online + manual options" },
          { label: "Online Enabled", value: metrics.onlineEnabled, sub: "Live online payments" },
          { label: "Manual Enabled", value: metrics.manualEnabled, sub: "UPI / bank transfer" },
          { label: "Credentials Set", value: metrics.configuredCredentials, sub: "Gateways with keys saved" }
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0 }}>{formatNumber(value)}</p>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0", fontWeight: 500 }}>{label}</p>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>{sub}</p>
          </div>
        ))}
      </div>

      {notice && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#15803d" }}>
          ✓ {notice}
        </div>
      )}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* desktop table */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 16 }} className="desktop-only">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
              {["Gateway", "Type", "Status / Mode", "Config", "Updated", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gateways.map((gw, idx) => (
              <tr key={gw.id} style={{ borderBottom: idx < gateways.length - 1 ? "1px solid #f9fafb" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <p style={{ fontWeight: 700, color: "#111827", margin: 0 }}>{gw.label}</p>
                  <GatewayTypeBadge code={gw.code} />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <StatusBadge value={gw.gatewayType} label={gw.gatewayType === "manual" ? "Manual" : "Online"} />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <StatusBadge value={gw.isEnabled ? "enabled" : "disabled"} />
                  <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0" }}>{gw.mode}</p>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0" }}>Priority: {gw.priority}</p>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0" }}>{formatGatewayLimits(gw)}</p>
                  <p style={{ fontSize: 12, margin: "2px 0", color: gw.credentialsConfigured ? "#15803d" : "#dc2626", fontWeight: 600 }}>
                    {gw.credentialsConfigured ? "✓ Credentials set" : "⚠ Credentials missing"}
                  </p>
                  {Object.keys(gw.instructions || {}).length > 0 && (
                    <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0" }}>{summarizeInstructions(gw.instructions)}</p>
                  )}
                </td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                  {formatDateTime(gw.updatedAt)}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => openGatewayModal(gw)}
                      style={{ background: "none", border: `1px solid ${BRAND}`, color: BRAND, fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 8, cursor: "pointer" }}
                    >
                      Configure
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>View only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="mobile-cards">
        {gateways.map(gw => (
          <div key={gw.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontWeight: 700, color: "#111827", margin: 0, fontSize: 14 }}>{gw.label}</p>
              <StatusBadge value={gw.isEnabled ? "enabled" : "disabled"} />
            </div>
            <GatewayTypeBadge code={gw.code} />
            <p style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 2px" }}>{gw.gatewayType === "manual" ? "Manual" : "Online"} / {gw.mode} / Priority {gw.priority}</p>
            <p style={{ fontSize: 12, color: gw.credentialsConfigured ? "#15803d" : "#dc2626", fontWeight: 600, margin: "2px 0 8px" }}>
              {gw.credentialsConfigured ? "✓ Credentials set" : "⚠ Credentials missing"}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() => openGatewayModal(gw)}
                style={{ background: BRAND, color: "#fff", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", width: "100%" }}
              >
                Configure
              </button>
            )}
          </div>
        ))}
      </div>

      <Modal
        title={selectedGateway ? `Configure — ${selectedGateway.label}` : "Configure Gateway"}
        open={modalOpen}
        onClose={closeModal}
        width="720px"
      >
        {detailLoading ? (
          <LoadingBlock label="Loading gateway configuration..." />
        ) : (
          <form onSubmit={onSubmitGateway}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Label</span>
                <input
                  value={gatewayForm.label}
                  onChange={e => setGatewayForm(f => ({ ...f, label: e.target.value }))}
                  required
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Mode</span>
                <select
                  value={gatewayForm.mode}
                  onChange={e => setGatewayForm(f => ({ ...f, mode: e.target.value }))}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }}
                >
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Priority</span>
                <input
                  type="number" min="1" max="1000"
                  value={gatewayForm.priority}
                  onChange={e => setGatewayForm(f => ({ ...f, priority: e.target.value }))}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }}
                />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Status</span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={gatewayForm.isEnabled}
                    onChange={e => setGatewayForm(f => ({ ...f, isEnabled: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: BRAND }}
                  />
                  <span style={{ fontSize: 13, color: "#374151" }}>Enable this gateway</span>
                </label>
              </div>
            </div>

            {/* credentials section */}
            <div style={{ background: "#f9fafb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {hasSmartFields ? "API Credentials" : "Credentials (JSON)"}
              </p>

              {hasSmartFields ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                  {CREDENTIAL_FIELDS[selectedGateway.code].map(f => (
                    <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{f.label}</span>
                      <input
                        type={f.type || "text"}
                        value={credentialForm[f.key] || ""}
                        placeholder={f.placeholder || ""}
                        onChange={e => setCredentialForm(c => ({ ...c, [f.key]: e.target.value }))}
                        style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "monospace", background: "#fff" }}
                      />
                    </label>
                  ))}
                  <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
                    Password fields: leave blank to keep the existing stored value.
                  </p>
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea
                    rows={6}
                    value={gatewayForm.credentialsText}
                    onChange={e => setGatewayForm(f => ({ ...f, credentialsText: e.target.value }))}
                    style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                  />
                </label>
              )}
            </div>

            {/* order amount limits */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Min Order Value (₹)</span>
                <input
                  type="number" min="0" step="0.01"
                  value={gatewayForm.minOrderValue}
                  onChange={e => setGatewayForm(f => ({ ...f, minOrderValue: e.target.value }))}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Max Order Value (₹)</span>
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Leave blank for no maximum"
                  value={gatewayForm.maxOrderValue}
                  onChange={e => setGatewayForm(f => ({ ...f, maxOrderValue: e.target.value }))}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }}
                />
              </label>
            </div>

            {/* instructions JSON (manual gateways) */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Instructions JSON <span style={{ fontWeight: 400, color: "#9ca3af" }}>(for manual gateways)</span></span>
                <textarea
                  rows={4}
                  value={gatewayForm.instructionsText}
                  onChange={e => setGatewayForm(f => ({ ...f, instructionsText: e.target.value }))}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                />
              </label>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: "#dc2626" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={closeModal}
                style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: saving ? "#9ca3af" : BRAND, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Saving..." : "Save Gateway"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
