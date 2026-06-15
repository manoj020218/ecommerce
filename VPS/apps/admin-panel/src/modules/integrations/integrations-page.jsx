import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { fetchIntegrations, updateIntegration } from "./integrations.api";

// ── Integration catalogue (UI metadata) ──────────────────────────────────────

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
  payments: [
    {
      code: "razorpay",
      label: "Razorpay",
      logo: "💳",
      description: "India's leading payment gateway",
      fields: [
        { key: "keyId", label: "Key ID", type: "text" },
        { key: "keySecret", label: "Key Secret", type: "password" },
        { key: "mode", label: "Mode", type: "select", options: ["test", "live"] }
      ]
    },
    {
      code: "cashfree",
      label: "Cashfree",
      logo: "💰",
      description: "Fast payouts & payment gateway",
      fields: [
        { key: "appId", label: "App ID", type: "text" },
        { key: "secretKey", label: "Secret Key", type: "password" },
        { key: "mode", label: "Mode", type: "select", options: ["test", "live"] }
      ]
    },
    {
      code: "phonepe",
      label: "PhonePe",
      logo: "📱",
      description: "UPI & payment gateway by PhonePe",
      fields: [
        { key: "merchantId", label: "Merchant ID", type: "text" },
        { key: "saltKey", label: "Salt Key", type: "password" },
        { key: "saltIndex", label: "Salt Index", type: "text" },
        { key: "mode", label: "Mode", type: "select", options: ["test", "live"] }
      ]
    },
    {
      code: "ccavenue",
      label: "CCAvenue",
      logo: "🏦",
      description: "Trusted payment gateway by Infibeam",
      fields: [
        { key: "merchantId", label: "Merchant ID", type: "text" },
        { key: "accessCode", label: "Access Code", type: "text" },
        { key: "workingKey", label: "Working Key", type: "password" },
        { key: "mode", label: "Mode", type: "select", options: ["test", "live"] }
      ]
    },
    {
      code: "payu",
      label: "PayU",
      logo: "🅿️",
      description: "PayU Money payment gateway",
      fields: [
        { key: "merchantKey", label: "Merchant Key", type: "text" },
        { key: "merchantSalt", label: "Merchant Salt", type: "password" },
        { key: "mode", label: "Mode", type: "select", options: ["test", "live"] }
      ]
    },
    {
      code: "paytm",
      label: "Paytm",
      logo: "💲",
      description: "Paytm payment gateway for businesses",
      fields: [
        { key: "merchantId", label: "Merchant ID", type: "text" },
        { key: "merchantKey", label: "Merchant Key", type: "password" },
        { key: "website", label: "Website", type: "text" },
        { key: "mode", label: "Mode", type: "select", options: ["test", "live"] }
      ]
    },
    {
      code: "cod",
      label: "Cash on Delivery",
      logo: "💵",
      description: "Accept cash payments on delivery",
      fields: []
    }
  ],
  others: [
    {
      code: "googleProductFeed",
      label: "Google Product Feed",
      logo: "🛍️",
      description: "Sync products to Google Merchant Center",
      fields: [
        { key: "merchantId", label: "Merchant Center ID", type: "text" }
      ]
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
      fields: [
        { key: "pixelId", label: "Pixel ID", type: "text" }
      ]
    },
    {
      code: "googleAnalytics",
      label: "Google Analytics",
      logo: "📈",
      description: "Measure site traffic with GA4",
      fields: [
        { key: "measurementId", label: "Measurement ID (G-XXXXXXX)", type: "text" }
      ]
    },
    {
      code: "googleTagManager",
      label: "Google Tag Manager",
      logo: "🏷️",
      description: "Manage all your tags from one place",
      fields: [
        { key: "gtmId", label: "GTM Container ID (GTM-XXXXX)", type: "text" }
      ]
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

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        cursor: disabled ? "wait" : "pointer",
        background: checked ? "var(--success)" : "#d1d5db",
        transition: "background 0.2s",
        padding: 0,
        flexShrink: 0
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s"
        }}
      />
    </button>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

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
      borderRadius: 12,
      padding: "16px 16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minWidth: 0,
      transition: "border-color 0.2s, box-shadow 0.2s",
      boxShadow: isEnabled ? "0 0 0 3px rgba(22,163,74,0.08)" : "none"
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "var(--bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0, border: "1px solid var(--border)"
          }}>
            {meta.logo}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{meta.label}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{meta.description}</div>
          </div>
        </div>
        <Toggle checked={isEnabled} onChange={onToggle} disabled={saving} />
      </div>

      {/* Status + configure */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 20,
          fontWeight: 500,
          background: isEnabled
            ? "rgba(22,163,74,0.1)"
            : isConfigured
              ? "rgba(37,99,235,0.08)"
              : "var(--bg)",
          color: isEnabled ? "var(--success)" : isConfigured ? "var(--info)" : "var(--muted)"
        }}>
          {isEnabled ? "Active" : isConfigured ? "Configured" : hasConfig ? "Not configured" : "Ready"}
        </span>
        {hasConfig && (
          <button
            type="button"
            onClick={onConfigure}
            style={{
              fontSize: 11, fontWeight: 600, color: "var(--brand)",
              background: "none", border: "none", cursor: "pointer",
              padding: "3px 0", textDecoration: "underline"
            }}
          >
            Configure
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function IntegrationSection({ title, items, configs, onToggle, onConfigure, saving }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h3 style={{
        fontSize: 15, fontWeight: 700, color: "var(--text)",
        margin: "0 0 16px", paddingBottom: 10,
        borderBottom: "2px solid var(--border)"
      }}>
        {title}
      </h3>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
        gap: 14
      }}>
        {items.map((meta) => (
          <IntegrationCard
            key={meta.code}
            meta={meta}
            config={configs[meta.code]}
            onToggle={(val) => onToggle(meta.code, val)}
            onConfigure={() => onConfigure(meta)}
            saving={saving === meta.code}
          />
        ))}
      </div>
    </div>
  );
}

// ── Configure modal ───────────────────────────────────────────────────────────

function ConfigureModal({ meta, config, onSave, onClose, saving, error }) {
  const [localForm, setLocalForm] = useState(() => {
    const init = {};
    for (const f of meta.fields) {
      init[f.key] = config?.[f.key] ?? (f.type === "number" ? 60 : "");
    }
    return init;
  });

  const onChange = (key, value) => setLocalForm((cur) => ({ ...cur, [key]: value }));

  return (
    <Modal title={`Configure — ${meta.label}`} open onClose={onClose} width="520px">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {meta.fields.map((f) => (
          <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{f.label}</span>
            {f.type === "select" ? (
              <select
                value={localForm[f.key] || ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                style={{
                  padding: "7px 10px", fontSize: 13,
                  border: "1px solid var(--border)", borderRadius: 7, background: "#fff"
                }}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                value={localForm[f.key] || ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                rows={3}
                placeholder={f.label}
                style={{
                  padding: "7px 10px", fontSize: 13,
                  border: "1px solid var(--border)", borderRadius: 7,
                  resize: "vertical", fontFamily: "inherit"
                }}
              />
            ) : (
              <input
                type={f.type}
                value={localForm[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.label}
                style={{
                  padding: "7px 10px", fontSize: 13,
                  border: "1px solid var(--border)", borderRadius: 7
                }}
              />
            )}
          </label>
        ))}

        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => onSave(localForm)}
          >
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(null);
  const [configuring, setConfiguring] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchIntegrations();
        setConfigs(data.integrations || {});
      } catch (err) {
        setError(err.message || "Failed to load integrations.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (code, enabled) => {
    setSaving(code);
    setNotice("");
    setError("");
    // optimistic update — flip immediately, rollback on error
    const prev = configs[code];
    setConfigs((cur) => ({ ...cur, [code]: { ...(cur[code] || {}), enabled } }));
    try {
      const updated = await updateIntegration(code, { enabled });
      setConfigs((cur) => ({ ...cur, [code]: updated }));
      setNotice(`${enabled ? "Enabled" : "Disabled"} successfully.`);
      setTimeout(() => setNotice(""), 3000);
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
      setNotice("Configuration saved.");
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setSaveError(err.message || "Failed to save.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      <PageHeader title="Third Party Integrations" subtitle="Connect shipping carriers, payment gateways, and marketing tools" />

      {error && <ErrorBlock message={error} style={{ marginBottom: 20 }} />}
      {notice && (
        <div style={{
          marginBottom: 20, padding: "10px 16px", borderRadius: 8,
          background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)",
          color: "var(--success)", fontSize: 13, fontWeight: 500
        }}>
          {notice}
        </div>
      )}

      <IntegrationSection
        title="Shipping Aggregators"
        items={INTEGRATIONS.shipping}
        configs={configs}
        onToggle={handleToggle}
        onConfigure={setConfiguring}
        saving={saving}
      />

      <IntegrationSection
        title="Payment Gateways"
        items={INTEGRATIONS.payments}
        configs={configs}
        onToggle={handleToggle}
        onConfigure={setConfiguring}
        saving={saving}
      />

      <IntegrationSection
        title="Others"
        items={INTEGRATIONS.others}
        configs={configs}
        onToggle={handleToggle}
        onConfigure={setConfiguring}
        saving={saving}
      />

      {configuring && (
        <ConfigureModal
          meta={configuring}
          config={configs[configuring.code]}
          onSave={handleSaveConfig}
          onClose={() => { setConfiguring(null); setSaveError(""); }}
          saving={saving === configuring.code}
          error={saveError}
        />
      )}
    </div>
  );
}
