import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import {
  fetchPaymentGatewayConfig,
  fetchPaymentGateways,
  updatePaymentGatewayConfig
} from "../payment-gateways/payment-gateways.api";
import { fetchIntegrations, updateIntegration } from "./integrations.api";

// ── Shipping / Others integration catalogue ───────────────────────────────────

const INTEGRATIONS = {
  shipping: [
    {
      code: "shiprocket",
      label: "Shiprocket",
      logo: "🚚",
      description: "Multi-carrier shipping & tracking for India",
      fields: [
        { key: "email", label: "Email", type: "email" },
        { key: "password", label: "Password", type: "password" },
        { key: "defaultWarehouse", label: "Default Warehouse Name", type: "text" }
      ]
    },
    {
      code: "delhivery",
      label: "Delhivery",
      logo: "📦",
      description: "Pan-India logistics & supply chain",
      fields: [
        { key: "apiKey", label: "API Key", type: "password" },
        { key: "warehouseName", label: "Warehouse Name", type: "text" },
        { key: "clientName", label: "Client Name", type: "text" }
      ]
    },
    {
      code: "shiprazor",
      label: "Shiprazor",
      logo: "✂️",
      description: "Shipping aggregator with automated NDR",
      fields: [
        { key: "apiKey", label: "API Key", type: "password" }
      ]
    }
  ],
  others: [
    {
      code: "googleProductFeed",
      label: "Google Product Feed",
      logo: "🛍️",
      description: "Sync products to Google Merchant Center",
      fields: [{ key: "merchantId", label: "Merchant Center ID", type: "text" }]
    },
    {
      code: "facebookProductFeed",
      label: "Facebook Product Feed",
      logo: "🗂️",
      description: "Sync catalog to Meta Commerce Manager",
      fields: [
        { key: "pixelId", label: "Pixel ID", type: "text" },
        { key: "accessToken", label: "System Access Token", type: "password" },
        { key: "catalogId", label: "Catalog ID", type: "text" }
      ]
    },
    {
      code: "abandonedCart",
      label: "Abandoned Cart Recovery",
      logo: "🛒",
      description: "Auto-remind customers with abandoned carts",
      fields: [
        { key: "delayMinutes", label: "Delay (minutes)", type: "number" },
        { key: "templateMessage", label: "Message Template", type: "textarea" }
      ]
    },
    {
      code: "facebookPixel",
      label: "Facebook Pixel",
      logo: "📊",
      description: "Track conversions via Meta Pixel",
      fields: [{ key: "pixelId", label: "Pixel ID", type: "text" }]
    },
    {
      code: "googleAnalytics",
      label: "Google Analytics",
      logo: "📈",
      description: "Measure site traffic with GA4",
      fields: [{ key: "measurementId", label: "Measurement ID (G-XXXXXXX)", type: "text" }]
    },
    {
      code: "googleTagManager",
      label: "Google Tag Manager",
      logo: "🏷️",
      description: "Manage all your tags from one place",
      fields: [{ key: "gtmId", label: "GTM Container ID (GTM-XXXXX)", type: "text" }]
    },
    {
      code: "whatsapp",
      label: "WhatsApp Business",
      logo: "💬",
      description: "Send order & shipping updates via WhatsApp",
      fields: [
        { key: "phoneNumberId", label: "Phone Number ID", type: "text" },
        { key: "accessToken", label: "Access Token", type: "password" },
        { key: "businessAccountId", label: "Business Account ID", type: "text" }
      ]
    }
  ]
};

// ── Payment gateway UI catalogue ──────────────────────────────────────────────

const GATEWAY_UI = {
  razorpay: {
    logo: "💳", label: "Razorpay",
    description: "India's leading payment gateway — ~2% fee",
    credentialFields: [
      { key: "keyId", label: "Key ID", type: "text", placeholder: "rzp_live_..." },
      { key: "keySecret", label: "Key Secret", type: "password" }
    ],
    hasMode: true
  },
  cashfree: {
    logo: "💰", label: "Cashfree",
    description: "Fast payouts & payment gateway — from 1.75%",
    credentialFields: [
      { key: "appId", label: "App ID", type: "text" },
      { key: "secretKey", label: "Secret Key", type: "password" }
    ],
    hasMode: true
  },
  phonepe: {
    logo: "📱", label: "PhonePe",
    description: "UPI-first payment gateway by PhonePe",
    credentialFields: [
      { key: "merchantId", label: "Merchant ID", type: "text" },
      { key: "saltKey", label: "Salt Key", type: "password" },
      { key: "saltIndex", label: "Salt Index", type: "text", placeholder: "1" }
    ],
    hasMode: true
  },
  ccavenue: {
    logo: "🏦", label: "CCAvenue",
    description: "200+ payment options by Infibeam",
    credentialFields: [
      { key: "merchantId", label: "Merchant ID", type: "text" },
      { key: "accessCode", label: "Access Code", type: "text" },
      { key: "workingKey", label: "Working Key", type: "password" }
    ],
    hasMode: true
  },
  payu: {
    logo: "🅿️", label: "PayU",
    description: "PayU Money — comprehensive India payments",
    credentialFields: [
      { key: "merchantKey", label: "Merchant Key", type: "text" },
      { key: "merchantSalt", label: "Merchant Salt", type: "password" }
    ],
    hasMode: true
  },
  paytm: {
    logo: "💲", label: "Paytm",
    description: "Paytm Payment Gateway — India's largest wallet",
    credentialFields: [
      { key: "merchantId", label: "Merchant ID", type: "text" },
      { key: "merchantKey", label: "Merchant Key", type: "password" },
      { key: "website", label: "Website", type: "text", placeholder: "WEBSTAGING" }
    ],
    hasMode: true
  },
  cod: {
    logo: "💵", label: "Cash on Delivery",
    description: "Accept cash at doorstep — zero commission",
    instructionFields: [
      { key: "note", label: "Note for customers", type: "text", placeholder: "Pay cash at delivery" }
    ],
    hasMode: false
  },
  direct_bank_transfer: {
    logo: "🏧", label: "Direct Bank Transfer",
    description: "NEFT / RTGS / IMPS / UPI — save 2–3% PG commission",
    instructionFields: [
      { key: "accountHolderName", label: "Account Holder Name", type: "text" },
      { key: "bankName", label: "Bank Name", type: "text" },
      { key: "accountNumber", label: "Account Number", type: "text" },
      { key: "ifsc", label: "IFSC Code", type: "text" },
      { key: "upiId", label: "UPI ID", type: "text", placeholder: "name@bank" },
      { key: "acceptedMethods", label: "Accepted Methods", type: "text", placeholder: "NEFT, RTGS, IMPS, UPI" },
      { key: "note", label: "Note for customers", type: "text" }
    ],
    hasMode: false
  },
  manual_upi: {
    logo: "📲", label: "Manual UPI",
    description: "Share UPI ID manually with buyer",
    instructionFields: [
      { key: "beneficiaryName", label: "Beneficiary Name", type: "text" },
      { key: "upiId", label: "UPI ID", type: "text", placeholder: "name@bank" }
    ],
    hasMode: false
  }
};

// Priority order for displaying gateways (online first, then manual)
const GATEWAY_DISPLAY_ORDER = [
  "razorpay", "cashfree", "phonepe", "ccavenue", "payu", "paytm",
  "direct_bank_transfer", "manual_upi", "cod"
];

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative", width: 40, height: 22, borderRadius: 11,
        border: "none", cursor: disabled ? "wait" : "pointer",
        background: checked ? "var(--success)" : "#d1d5db",
        transition: "background 0.2s", padding: 0, flexShrink: 0
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        transition: "left 0.2s"
      }} />
    </button>
  );
}

// ── Generic integration card (shipping / others) ──────────────────────────────

function IntegrationCard({ meta, config, onToggle, onConfigure, saving }) {
  const isEnabled = config?.enabled || false;
  const hasConfig = meta.fields.length > 0;
  const isConfigured = hasConfig && meta.fields.some(
    (f) => f.type !== "select" && f.type !== "number" && (config?.[f.key] || "").trim()
  );
  return (
    <div style={{
      background: "var(--surface)",
      border: `1.5px solid ${isEnabled ? "var(--success)" : "var(--border)"}`,
      borderRadius: 12, padding: "12px 12px 14px",
      display: "flex", flexDirection: "column", alignItems: "center",
      position: "relative", minWidth: 0, minHeight: 140,
      transition: "border-color 0.2s, box-shadow 0.2s",
      boxShadow: isEnabled ? "0 0 0 3px rgba(22,163,74,0.08)" : "none"
    }}>
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <Toggle checked={isEnabled} onChange={onToggle} disabled={saving} />
      </div>
      <div style={{
        width: 52, height: 52, borderRadius: 12, background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, border: "1px solid var(--border)", marginTop: 8, marginBottom: 8, flexShrink: 0
      }}>{meta.logo}</div>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", textAlign: "center", marginBottom: 2 }}>{meta.label}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", marginBottom: 8, lineHeight: 1.3 }}>{meta.description}</div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{
          fontSize: 10, color: isEnabled ? "var(--success)" : isConfigured ? "var(--info)" : "var(--muted)", fontWeight: 500
        }}>
          {isEnabled ? "Active" : isConfigured ? "Configured" : hasConfig ? "Not configured" : "Ready"}
        </span>
        {hasConfig && (
          <button type="button" onClick={onConfigure} style={{
            fontSize: 11, fontWeight: 600, color: "var(--brand)",
            background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline"
          }}>Configure</button>
        )}
      </div>
    </div>
  );
}

// ── Payment gateway card (uses real payment-gateways data) ────────────────────

function PaymentGatewayCard({ gateway, onToggle, onConfigure, saving }) {
  const ui = GATEWAY_UI[gateway.code] || { logo: "💳", label: gateway.label, description: "" };
  const isEnabled = gateway.isEnabled;
  const hasFields = (ui.credentialFields || ui.instructionFields || []).length > 0;
  const isConfigured = gateway.credentialsConfigured || Object.keys(gateway.instructions || {}).some((k) => gateway.instructions[k]);
  const isManual = gateway.gatewayType === "manual";
  const isStatic = gateway._static;

  return (
    <div style={{
      background: "var(--surface)",
      border: `1.5px solid ${isEnabled ? (isManual ? "var(--info)" : "var(--success)") : "var(--border)"}`,
      borderRadius: 12, padding: "12px 12px 14px",
      display: "flex", flexDirection: "column", alignItems: "center",
      position: "relative", minWidth: 0, minHeight: 140,
      transition: "border-color 0.2s, box-shadow 0.2s",
      boxShadow: isEnabled ? `0 0 0 3px ${isManual ? "rgba(37,99,235,0.08)" : "rgba(22,163,74,0.08)"}` : "none",
      opacity: isStatic ? 0.65 : 1
    }}>
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <Toggle checked={isEnabled} onChange={isStatic ? undefined : onToggle} disabled={saving || isStatic} />
      </div>
      <div style={{
        width: 52, height: 52, borderRadius: 12, background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, border: "1px solid var(--border)", marginTop: 8, marginBottom: 8, flexShrink: 0
      }}>{ui.logo}</div>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", textAlign: "center", marginBottom: 2 }}>{ui.label || gateway.label}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", marginBottom: 8, lineHeight: 1.3 }}>{ui.description}</div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {isStatic ? (
          <span style={{ fontSize: 10, color: "var(--muted)" }}>Restart backend to load</span>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 500,
            color: isEnabled ? (isManual ? "var(--info)" : "var(--success)") : isConfigured ? "var(--info)" : "var(--muted)"
          }}>
            {isEnabled ? "Active" : isConfigured ? "Configured" : "Not configured"}
          </span>
        )}
        {hasFields && !isStatic && (
          <button type="button" onClick={onConfigure} style={{
            fontSize: 11, fontWeight: 600, color: "var(--brand)",
            background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline"
          }}>Configure</button>
        )}
      </div>
    </div>
  );
}

// ── Payment gateway configure modal ──────────────────────────────────────────

function GatewayConfigModal({ gateway, onSave, onClose, saving, error }) {
  const ui = GATEWAY_UI[gateway.code] || {};
  const credFields = ui.credentialFields || [];
  const instrFields = ui.instructionFields || [];

  const [localCreds, setLocalCreds] = useState(() => {
    const init = {};
    for (const f of credFields) init[f.key] = gateway.credentials?.[f.key] || "";
    return init;
  });
  const [localInstrs, setLocalInstrs] = useState(() => {
    const init = {};
    for (const f of instrFields) init[f.key] = gateway.instructions?.[f.key] || "";
    return init;
  });
  const [localMode, setLocalMode] = useState(gateway.mode || "test");

  const handleSave = () => {
    const patch = {};
    if (credFields.length) patch.credentials = localCreds;
    if (instrFields.length) patch.instructions = localInstrs;
    if (ui.hasMode) patch.mode = localMode;
    onSave(patch);
  };

  const renderField = (f, value, onChange) => (
    <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{f.label}</span>
      <input
        type={f.type || "text"}
        value={value}
        placeholder={f.placeholder || ""}
        onChange={(e) => onChange(f.key, e.target.value)}
        style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
      />
    </label>
  );

  return (
    <Modal title={`Configure — ${ui.label || gateway.label}`} open onClose={onClose} width="520px">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {ui.hasMode && (
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Mode</span>
            <select
              value={localMode} onChange={(e) => setLocalMode(e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, background: "#fff" }}
            >
              <option value="test">Test (Sandbox)</option>
              <option value="live">Live (Production)</option>
            </select>
          </label>
        )}

        {credFields.map((f) => renderField(f, localCreds[f.key] || "", (k, v) =>
          setLocalCreds((c) => ({ ...c, [k]: v }))
        ))}
        {instrFields.map((f) => renderField(f, localInstrs[f.key] || "", (k, v) =>
          setLocalInstrs((c) => ({ ...c, [k]: v }))
        ))}

        {!credFields.length && !instrFields.length && (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No configuration required — just toggle to enable.</p>
        )}

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function IntegrationSection({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ paddingBottom: 12, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>{subtitle}</p>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

// ── Generic configure modal (shipping / others) ───────────────────────────────

function ConfigureModal({ meta, config, onSave, onClose, saving, error }) {
  const [localForm, setLocalForm] = useState(() => {
    const init = {};
    for (const f of meta.fields) init[f.key] = config?.[f.key] ?? (f.type === "number" ? 60 : "");
    return init;
  });
  const onChange = (key, value) => setLocalForm((cur) => ({ ...cur, [key]: value }));
  return (
    <Modal title={`Configure — ${meta.label}`} open onClose={onClose} width="520px">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {meta.fields.map((f) => (
          <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{f.label}</span>
            {f.type === "textarea" ? (
              <textarea
                value={localForm[f.key] || ""} onChange={(e) => onChange(f.key, e.target.value)}
                rows={3} placeholder={f.label}
                style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
              />
            ) : (
              <input
                type={f.type || "text"} value={localForm[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.label}
                style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
              />
            )}
          </label>
        ))}
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(localForm)}>
            {saving ? "Saving…" : "Save Configuration"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState({});
  const [paymentGateways, setPaymentGateways] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // shipping/others state
  const [saving, setSaving] = useState(null);
  const [configuring, setConfiguring] = useState(null);
  const [saveError, setSaveError] = useState("");

  // payment gateway state
  const [pgSaving, setPgSaving] = useState(null);
  const [pgConfiguring, setPgConfiguring] = useState(null);
  const [pgSaveError, setPgSaveError] = useState("");

  const showNotice = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 3000); };

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Use allSettled so one API failure doesn't blank the other section
      const [intResult, pgResult] = await Promise.allSettled([
        fetchIntegrations(),
        fetchPaymentGateways()
      ]);

      if (intResult.status === "fulfilled") {
        setConfigs(intResult.value?.integrations || {});
      } else {
        setError("Integration settings unavailable: " + (intResult.reason?.message || "Network error"));
      }

      if (pgResult.status === "fulfilled") {
        const gws = (Array.isArray(pgResult.value?.gateways) ? pgResult.value.gateways : [])
          .filter((g) => g.code !== "mock_online");
        gws.sort((a, b) => {
          const ai = GATEWAY_DISPLAY_ORDER.indexOf(a.code);
          const bi = GATEWAY_DISPLAY_ORDER.indexOf(b.code);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        setPaymentGateways(gws);
      } else {
        // Fallback: show static catalog cards so the section is never blank
        const MANUAL_CODES = ["cod", "direct_bank_transfer", "manual_upi"];
        setPaymentGateways(
          GATEWAY_DISPLAY_ORDER
            .filter((code) => GATEWAY_UI[code])
            .map((code) => ({
              code,
              label: GATEWAY_UI[code].label,
              gatewayType: MANUAL_CODES.includes(code) ? "manual" : "online",
              isEnabled: false,
              credentialsConfigured: false,
              instructions: {},
              _static: true
            }))
        );
      }

      setLoading(false);
    })();
  }, []);

  // ── handlers: shipping/others integrations ──────────────────────────────────

  const handleToggle = async (code, enabled) => {
    setSaving(code);
    setError("");
    const prev = configs[code];
    setConfigs((cur) => ({ ...cur, [code]: { ...(cur[code] || {}), enabled } }));
    try {
      const updated = await updateIntegration(code, { enabled });
      setConfigs((cur) => ({ ...cur, [code]: updated }));
      showNotice(`${enabled ? "Enabled" : "Disabled"} successfully.`);
    } catch (err) {
      setConfigs((cur) => ({ ...cur, [code]: prev || {} }));
      setError(err.message || "Failed to update.");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveConfig = async (form) => {
    if (!configuring) return;
    setSaving(configuring.code);
    setSaveError("");
    try {
      const updated = await updateIntegration(configuring.code, form);
      setConfigs((cur) => ({ ...cur, [configuring.code]: updated }));
      setConfiguring(null);
      showNotice("Configuration saved.");
    } catch (err) {
      setSaveError(err.message || "Failed to save.");
    } finally {
      setSaving(null);
    }
  };

  // ── handlers: payment gateways ──────────────────────────────────────────────

  const handlePgToggle = async (code, isEnabled) => {
    setPgSaving(code);
    setError("");
    setPaymentGateways((gws) =>
      gws.map((g) => (g.code === code ? { ...g, isEnabled } : g))
    );
    try {
      await updatePaymentGatewayConfig(code, { isEnabled });
      showNotice(`${isEnabled ? "Enabled" : "Disabled"} successfully.`);
    } catch (err) {
      setPaymentGateways((gws) =>
        gws.map((g) => (g.code === code ? { ...g, isEnabled: !isEnabled } : g))
      );
      setError(err.message || "Failed to update.");
    } finally {
      setPgSaving(null);
    }
  };

  const handlePgConfigure = async (gateway) => {
    // Fetch full config (with credentials) before opening modal
    try {
      const full = await fetchPaymentGatewayConfig(gateway.code);
      setPgConfiguring(full);
    } catch {
      setPgConfiguring(gateway);
    }
    setPgSaveError("");
  };

  const handlePgSaveConfig = async (patch) => {
    if (!pgConfiguring) return;
    setPgSaving(pgConfiguring.code);
    setPgSaveError("");
    try {
      await updatePaymentGatewayConfig(pgConfiguring.code, patch);
      // refresh
      const pgData = await fetchPaymentGateways();
      const gws = (Array.isArray(pgData?.gateways) ? pgData.gateways : [])
        .filter((g) => g.code !== "mock_online");
      gws.sort((a, b) => {
        const ai = GATEWAY_DISPLAY_ORDER.indexOf(a.code);
        const bi = GATEWAY_DISPLAY_ORDER.indexOf(b.code);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setPaymentGateways(gws);
      setPgConfiguring(null);
      showNotice("Gateway configuration saved.");
    } catch (err) {
      setPgSaveError(err.message || "Failed to save.");
    } finally {
      setPgSaving(null);
    }
  };

  if (loading) return <LoadingBlock />;

  const onlineGateways = paymentGateways.filter((g) => g.gatewayType === "online");
  const manualGateways = paymentGateways.filter((g) => g.gatewayType === "manual");

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      <PageHeader
        title="Third Party Integrations"
        subtitle="Connect shipping carriers, payment gateways, and marketing tools"
      />

      {error && <ErrorBlock message={error} style={{ marginBottom: 20 }} />}
      {notice && (
        <div style={{
          marginBottom: 20, padding: "10px 16px", borderRadius: 8,
          background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)",
          color: "var(--success)", fontSize: 13, fontWeight: 500
        }}>{notice}</div>
      )}

      {/* ── Shipping Aggregators ── */}
      <IntegrationSection title="Shipping Aggregators" subtitle="Connect carriers to auto-book shipments and track orders">
        {INTEGRATIONS.shipping.map((meta) => (
          <IntegrationCard
            key={meta.code} meta={meta} config={configs[meta.code]}
            onToggle={(val) => handleToggle(meta.code, val)}
            onConfigure={() => { setConfiguring(meta); setSaveError(""); }}
            saving={saving === meta.code}
          />
        ))}
      </IntegrationSection>

      {/* ── Payment Gateways (Online) ── */}
      <IntegrationSection
        title="Payment Gateways"
        subtitle="Online payment collection — toggle Live mode only when credentials are configured"
      >
        {onlineGateways.map((gw) => (
          <PaymentGatewayCard
            key={gw.code} gateway={gw}
            onToggle={(val) => handlePgToggle(gw.code, val)}
            onConfigure={() => handlePgConfigure(gw)}
            saving={pgSaving === gw.code}
          />
        ))}
      </IntegrationSection>

      {/* ── Direct & Manual Payments ── */}
      <IntegrationSection
        title="Direct & Manual Payments"
        subtitle="Zero PG commission — bank transfer, UPI, and cash on delivery"
      >
        {manualGateways.map((gw) => (
          <PaymentGatewayCard
            key={gw.code} gateway={gw}
            onToggle={(val) => handlePgToggle(gw.code, val)}
            onConfigure={() => handlePgConfigure(gw)}
            saving={pgSaving === gw.code}
          />
        ))}
      </IntegrationSection>

      {/* ── Others ── */}
      <IntegrationSection title="Others" subtitle="Analytics, marketing pixels, and automation tools">
        {INTEGRATIONS.others.map((meta) => (
          <IntegrationCard
            key={meta.code} meta={meta} config={configs[meta.code]}
            onToggle={(val) => handleToggle(meta.code, val)}
            onConfigure={() => { setConfiguring(meta); setSaveError(""); }}
            saving={saving === meta.code}
          />
        ))}
      </IntegrationSection>

      {/* ── Modals ── */}
      {configuring && (
        <ConfigureModal
          meta={configuring} config={configs[configuring.code]}
          onSave={handleSaveConfig}
          onClose={() => { setConfiguring(null); setSaveError(""); }}
          saving={saving === configuring.code}
          error={saveError}
        />
      )}

      {pgConfiguring && (
        <GatewayConfigModal
          gateway={pgConfiguring}
          onSave={handlePgSaveConfig}
          onClose={() => { setPgConfiguring(null); setPgSaveError(""); }}
          saving={pgSaving === pgConfiguring.code}
          error={pgSaveError}
        />
      )}
    </div>
  );
}
