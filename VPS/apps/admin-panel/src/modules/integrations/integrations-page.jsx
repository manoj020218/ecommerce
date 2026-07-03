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
import { addCourier, deleteCourier, fetchCouriers, fetchIntegrations, fetchGoogleOAuthConfig, saveGoogleOAuthConfig, probeTracking, updateCourier, updateIntegration } from "./integrations.api";

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
      description: "wa.me links for orders & live chat — no API purchase needed",
      fields: [
        { key: "phoneNumber", label: "WhatsApp Number (with country code)", type: "tel", placeholder: "919876543210 (no + or spaces)" },
        { key: "enableLiveChat", label: "Show live chat widget on storefront", type: "checkbox" },
        { key: "liveChatMessage", label: "Pre-fill chat message (optional)", type: "text", placeholder: "Hi! I have a query about my order." }
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
  },
  easebuzz: {
    logo: "⚡", label: "Easebuzz",
    description: "Low-cost Indian PG — from 1.5% per transaction",
    credentialFields: [
      { key: "key", label: "Merchant Key", type: "text", placeholder: "Your Easebuzz key" },
      { key: "salt", label: "Merchant Salt", type: "password" },
      { key: "env", label: "Environment", type: "text", placeholder: "prod / test" }
    ],
    hasMode: true
  },
  instamojo: {
    logo: "💫", label: "Instamojo",
    description: "Simple PG for small businesses — 2% fee",
    credentialFields: [
      { key: "apiKey", label: "API Key", type: "text" },
      { key: "authToken", label: "Auth Token", type: "password" },
      { key: "privateKey", label: "Private Salt (optional)", type: "password" }
    ],
    hasMode: true
  },
  stripe: {
    logo: "🌐", label: "Stripe",
    description: "Global payments — 2.9% + ₹2 per transaction",
    credentialFields: [
      { key: "publishableKey", label: "Publishable Key", type: "text", placeholder: "pk_live_..." },
      { key: "secretKey", label: "Secret Key", type: "password", placeholder: "sk_live_..." },
      { key: "webhookSecret", label: "Webhook Signing Secret", type: "password", placeholder: "whsec_..." }
    ],
    hasMode: true
  },
  juspay: {
    logo: "🔐", label: "Juspay",
    description: "Enterprise checkout & routing platform",
    credentialFields: [
      { key: "merchantId", label: "Merchant ID", type: "text" },
      { key: "apiKey", label: "API Key", type: "password" },
      { key: "clientId", label: "Client ID", type: "text" }
    ],
    hasMode: true
  }
};

const MANUAL_GATEWAY_CODES = ["cod", "direct_bank_transfer", "manual_upi"];

// All gateways in display order — cards always render regardless of backend support
const GATEWAY_DISPLAY_ORDER = [
  "razorpay", "cashfree", "phonepe", "ccavenue", "payu", "paytm",
  "easebuzz", "instamojo", "stripe", "juspay",
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
    (f) => f.type === "checkbox" ? Boolean(config?.[f.key]) : (f.type !== "select" && f.type !== "number" && (config?.[f.key] || "").trim())
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

function GatewayConfigModal({ gateway, onSave, onClose, saving, error, isStatic }) {
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
        {isStatic && (
          <div style={{
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 8, padding: "10px 14px"
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "#92400e", fontWeight: 500 }}>
              Backend integration pending — fields below show what credentials will be required.
              Once your backend developer adds support for this gateway, you can save and activate it.
            </p>
          </div>
        )}
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
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {isStatic ? "Close" : "Cancel"}
          </button>
          {!isStatic && (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </button>
          )}
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
    for (const f of meta.fields) {
      if (f.type === "checkbox") init[f.key] = Boolean(config?.[f.key]);
      else init[f.key] = config?.[f.key] ?? (f.type === "number" ? 60 : "");
    }
    return init;
  });
  const onChange = (key, value) => setLocalForm((cur) => ({ ...cur, [key]: value }));

  const isWhatsApp = meta.code === "whatsapp";

  return (
    <Modal title={`Configure — ${meta.label}`} open onClose={onClose} width="520px">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {isWhatsApp && (
          <div style={{
            background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.3)",
            borderRadius: 8, padding: "10px 14px"
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "#166534", fontWeight: 500 }}>
              No API purchase needed — WhatsApp icons will use <strong>wa.me/</strong> links.
              Clicking them opens WhatsApp with the customer's number and a pre-filled message.
              Enable the toggle above to activate WhatsApp features throughout the admin panel.
            </p>
          </div>
        )}
        {meta.fields.map((f) => (
          f.type === "checkbox" ? (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}>
              <div
                role="switch" aria-checked={Boolean(localForm[f.key])}
                onClick={() => onChange(f.key, !localForm[f.key])}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                  background: localForm[f.key] ? "var(--success)" : "#d1d5db",
                  position: "relative", transition: "background 0.2s", flexShrink: 0
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: localForm[f.key] ? 21 : 3,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s"
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{f.label}</span>
            </label>
          ) : (
            <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{f.label}</span>
              {f.type === "textarea" ? (
                <textarea
                  value={localForm[f.key] || ""} onChange={(e) => onChange(f.key, e.target.value)}
                  rows={3} placeholder={f.placeholder || f.label}
                  style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
                />
              ) : (
                <input
                  type={f.type || "text"} value={localForm[f.key] ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder || f.label}
                  style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
                />
              )}
            </label>
          )
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

// ── Custom courier card ───────────────────────────────────────────────────────

function CustomCourierCard({ courier, onToggle, onEdit, onDelete, saving }) {
  const initials = courier.name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      background: "var(--surface)",
      border: `1.5px solid ${courier.isActive ? "var(--success)" : "var(--border)"}`,
      borderRadius: 12, padding: "12px 12px 14px",
      display: "flex", flexDirection: "column", alignItems: "center",
      position: "relative", minWidth: 0, minHeight: 140,
      transition: "border-color 0.2s, box-shadow 0.2s",
      boxShadow: courier.isActive ? "0 0 0 3px rgba(22,163,74,0.08)" : "none"
    }}>
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <Toggle checked={courier.isActive} onChange={onToggle} disabled={saving} />
      </div>
      <div style={{
        width: 52, height: 52, borderRadius: 12,
        background: courier.isActive ? "rgba(22,163,74,0.12)" : "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: 17, color: courier.isActive ? "var(--success)" : "var(--muted)",
        border: "1px solid var(--border)", marginTop: 8, marginBottom: 8, flexShrink: 0
      }}>{initials}</div>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", textAlign: "center", marginBottom: 2 }}>{courier.name}</div>
      {courier.phone && (
        <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", marginBottom: 4 }}>{courier.phone}</div>
      )}
      {courier.trackingUrl && (
        <div style={{
          fontSize: 9, color: "var(--muted)", textAlign: "center", marginBottom: 6,
          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
        }} title={courier.trackingUrl}>{courier.trackingUrl}</div>
      )}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {courier._builtin && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
            letterSpacing: 0.5, border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px"
          }}>Built-in</span>
        )}
        <button type="button" onClick={onEdit} style={{
          fontSize: 11, fontWeight: 600, color: "var(--brand)",
          background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline"
        }}>Edit</button>
        {onDelete && (
          <button type="button" onClick={onDelete} style={{
            fontSize: 11, fontWeight: 600, color: "var(--danger)",
            background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline"
          }}>Delete</button>
        )}
      </div>
    </div>
  );
}

// ── "+" Add courier card ──────────────────────────────────────────────────────

function AddCourierCard({ onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: 12,
      padding: "12px", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: 140, cursor: "pointer", width: "100%",
      transition: "border-color 0.2s, background 0.2s", gap: 8
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "rgba(232,35,26,0.04)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: "50%", border: "2px dashed var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, color: "var(--brand)", fontWeight: 300, lineHeight: 1
      }}>+</div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)" }}>Add Courier</span>
      <span style={{ fontSize: 10, color: "var(--muted)", textAlign: "center" }}>Custom courier partner</span>
    </button>
  );
}

// ── Add / Edit courier modal ──────────────────────────────────────────────────

const EMPTY_COURIER_FORM = { name: "", trackingUrl: "", trackingApiUrl: "", phone: "", isActive: true };

// Renders the decoded tracking result from the backend
function TrackingResult({ result }) {
  if (!result) return null;
  const statusColors = {
    DELIVERED: { bg: "rgba(22,163,74,0.1)", color: "var(--success)", border: "rgba(22,163,74,0.3)" },
    OUT_FOR_DELIVERY: { bg: "rgba(37,99,235,0.08)", color: "var(--info)", border: "rgba(37,99,235,0.2)" },
    IN_TRANSIT: { bg: "rgba(245,158,11,0.08)", color: "#b45309", border: "rgba(245,158,11,0.3)" },
  };
  const sc = statusColors[result.currentStatus] || { bg: "var(--bg)", color: "var(--muted)", border: "var(--border)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Status pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: sc.bg, border: `1px solid ${sc.border}`,
        borderRadius: 10, padding: "10px 14px"
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: sc.color }}>{result.currentStatusLabel}</div>
          {result.currentLocation && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Last location: {result.currentLocation}</div>
          )}
        </div>
        {result.isDelivered && <span style={{ fontSize: 18 }}>✅</span>}
      </div>

      {/* Origin → Destination */}
      {(result.origin?.city || result.destination?.city) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
          <span>{result.origin?.city}{result.origin?.state ? `, ${result.origin.state}` : ""}</span>
          <span>→</span>
          <span>{result.destination?.city}{result.destination?.state ? `, ${result.destination.state}` : ""}</span>
        </div>
      )}

      {/* POD images */}
      {result.podLinks?.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {result.podLinks.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 11, color: "var(--brand)", textDecoration: "underline"
            }}>View POD {i + 1}</a>
          ))}
        </div>
      )}

      {/* Events timeline */}
      {result.events?.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: "auto", borderRadius: 8, border: "1px solid var(--border)" }}>
          {result.events.map((ev, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, padding: "8px 12px",
              borderBottom: i < result.events.length - 1 ? "1px solid var(--border)" : "none",
              background: i === 0 ? "rgba(22,163,74,0.04)" : "transparent"
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                background: i === 0 ? "var(--success)" : "var(--border)"
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{ev.label}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  {ev.location && <span>{ev.location} · </span>}
                  {ev.timestamp && <span>{new Date(ev.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CourierModal({ initial, onSave, onClose, saving, error }) {
  const [form, setForm] = useState(initial || EMPTY_COURIER_FORM);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const isEdit = Boolean(initial?.id);

  const [testId, setTestId] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");

  const handleTest = async () => {
    if (!form.trackingApiUrl || !testId.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestError("");
    try {
      const res = await probeTracking({ trackingApiUrl: form.trackingApiUrl, trackingId: testId.trim() });
      setTestResult(res);
    } catch (err) {
      setTestError(err.message || "Failed to fetch tracking.");
    } finally {
      setTesting(false);
    }
  };

  const field = (label, key, type = "text", placeholder = "", hint = null, required = false) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
        {label}{required && <span style={{ color: "var(--danger)" }}> *</span>}
      </span>
      <input
        type={type} value={form[key] || ""} placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
      />
      {hint && <span style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</span>}
    </label>
  );

  return (
    <Modal title={isEdit ? "Edit Courier Partner" : "Add Courier Partner"} open onClose={onClose} width="560px">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {field("Courier Name", "name", "text", "e.g. Shree Maruti Courier", null, true)}
        {field("Contact / Phone", "phone", "text", "e.g. 1800-123-4567")}

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tracking Configuration</div>

          {field(
            "Customer Tracking URL",
            "trackingUrl",
            "text",
            "https://courier.com/track?awb={trackingId}",
            <span>Use <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 4 }}>{"{trackingId}"}</code> — replaced with the AWB when emailing the customer.</span>
          )}

          {field(
            "Live Tracking API URL",
            "trackingApiUrl",
            "text",
            "https://apis-hubops.innofulfill.com/tracking/v2/{trackingId}",
            <span>REST API endpoint that returns JSON tracking data. Use <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 4 }}>{"{trackingId}"}</code> as placeholder.</span>
          )}
        </div>

        {/* Test panel — only shown when API URL is filled */}
        {form.trackingApiUrl && (
          <div style={{
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
              Test Live Tracking
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text" value={testId}
                placeholder="Enter AWB / Tracking number"
                onChange={(e) => setTestId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTest()}
                style={{
                  flex: 1, padding: "7px 10px", fontSize: 13,
                  border: "1px solid var(--border)", borderRadius: 7
                }}
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !testId.trim()}
                style={{
                  padding: "7px 14px", fontSize: 12, fontWeight: 600,
                  background: "var(--brand)", color: "#fff", border: "none",
                  borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap",
                  opacity: (testing || !testId.trim()) ? 0.6 : 1
                }}
              >
                {testing ? "Fetching…" : "Fetch Status"}
              </button>
            </div>
            {testError && <p style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>{testError}</p>}
            {testResult && <TrackingResult result={testResult} />}
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox" checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            style={{ width: 15, height: 15 }}
          />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Active — show in order processing dropdown</span>
        </label>

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary"
            disabled={saving || !form.name.trim()}
            onClick={() => onSave(form)}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Courier"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Google OAuth inline section ───────────────────────────────────────────────

function GoogleOAuthSection({ config, saving, error, onSave }) {
  const [form, setForm] = useState({
    enabled: config?.enabled || false,
    clientId: config?.clientId || "",
    clientSecret: ""
  });

  useEffect(() => {
    setForm((f) => ({ ...f, enabled: config?.enabled || false, clientId: config?.clientId || "" }));
  }, [config]);

  const isActive = form.enabled && form.clientId;

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ paddingBottom: 12, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>Customer Authentication</h3>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
          Let buyers sign in with their Google account — no password needed
        </p>
      </div>

      <div style={{
        background: "var(--surface)", border: `1.5px solid ${isActive ? "var(--success)" : "var(--border)"}`,
        borderRadius: 14, padding: "20px 22px", maxWidth: 560,
        boxShadow: isActive ? "0 0 0 3px rgba(22,163,74,0.08)" : "none",
        transition: "border-color 0.2s, box-shadow 0.2s"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: "var(--bg)",
            border: "1px solid var(--border)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 22, flexShrink: 0
          }}>🔑</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Google Sign-In</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              OAuth 2.0 redirect flow — works in PWA standalone mode
            </div>
          </div>
          <Toggle
            checked={form.enabled}
            onChange={(val) => setForm((f) => ({ ...f, enabled: val }))}
            disabled={saving}
          />
        </div>

        {config?.hasSecret && !form.clientSecret && (
          <div style={{
            marginBottom: 14, padding: "8px 12px", borderRadius: 8,
            background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)",
            fontSize: 12, color: "#1e40af"
          }}>
            Client Secret is saved. Leave the field below blank to keep it unchanged.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Client ID</span>
            <input
              type="text" value={form.clientId}
              placeholder="1234567890-abc...googleusercontent.com"
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              style={{ padding: "8px 11px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, fontFamily: "monospace" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              Client Secret{config?.hasSecret ? " (leave blank to keep existing)" : ""}
            </span>
            <input
              type="password" value={form.clientSecret}
              placeholder={config?.hasSecret ? "••••••••••••••••" : "GOCSPX-..."}
              onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
              style={{ padding: "8px 11px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, fontFamily: "monospace" }}
            />
          </label>
        </div>

        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
          Get credentials at <strong>console.cloud.google.com → APIs &amp; Services → Credentials</strong>.<br />
          Set Authorized redirect URI to: <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>https://test.jenixindia.com/account/google-callback</code>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 12px" }}>{error}</p>}

        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || (!form.clientId && !config?.clientId)}
          onClick={() => onSave(form)}
          style={{ minWidth: 120 }}
        >
          {saving ? "Saving…" : "Save Google OAuth"}
        </button>
      </div>
    </div>
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

  // custom courier state
  const [couriers, setCouriers] = useState([]);
  const [courierModal, setCourierModal] = useState(null); // null | "add" | courier object
  const [courierSaving, setCourierSaving] = useState(false);
  const [courierError, setCourierError] = useState("");
  const [courierDeleting, setCourierDeleting] = useState(null);

  // google oauth state
  const [googleConfig, setGoogleConfig] = useState(null);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleError, setGoogleError] = useState("");

  const showNotice = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 3000); };

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Use allSettled so one API failure doesn't blank the other section
      const [intResult, pgResult, courierResult, googleResult] = await Promise.allSettled([
        fetchIntegrations(),
        fetchPaymentGateways(),
        fetchCouriers(),
        fetchGoogleOAuthConfig()
      ]);
      if (googleResult.status === "fulfilled") {
        setGoogleConfig(googleResult.value);
      }

      if (intResult.status === "fulfilled") {
        setConfigs(intResult.value?.integrations || {});
        // customCouriers may be bundled in the integrations response
        if (Array.isArray(intResult.value?.customCouriers)) {
          setCouriers(intResult.value.customCouriers);
        }
      } else {
        setError("Integration settings unavailable: " + (intResult.reason?.message || "Network error"));
      }

      // Dedicated couriers endpoint result takes precedence if successful
      if (courierResult.status === "fulfilled") {
        const rows = Array.isArray(courierResult.value?.couriers) ? courierResult.value.couriers : [];
        if (rows.length > 0 || courierResult.value?.couriers) setCouriers(rows);
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

  // ── handlers: custom couriers ──────────────────────────────────────────────

  const handleCourierToggle = async (courier) => {
    const next = !courier.isActive;
    setCouriers((list) => list.map((c) => c.id === courier.id ? { ...c, isActive: next } : c));
    try {
      const updated = await updateCourier(courier.id, { isActive: next });
      setCouriers((list) => list.map((c) => c.id === courier.id ? updated : c));
      showNotice(`${courier.name} ${next ? "activated" : "deactivated"}.`);
    } catch (err) {
      setCouriers((list) => list.map((c) => c.id === courier.id ? { ...c, isActive: !next } : c));
      setError(err.message || "Failed to update courier.");
    }
  };

  const handleCourierSave = async (form) => {
    setCourierSaving(true);
    setCourierError("");
    try {
      if (courierModal?.id) {
        const updated = await updateCourier(courierModal.id, form);
        setCouriers((list) => list.map((c) => c.id === courierModal.id ? updated : c));
        showNotice("Courier updated.");
      } else {
        const created = await addCourier(form);
        setCouriers((list) => [...list, created]);
        showNotice(`${form.name} added as courier partner.`);
      }
      setCourierModal(null);
    } catch (err) {
      setCourierError(err.message || "Failed to save courier.");
    } finally {
      setCourierSaving(false);
    }
  };

  const handleCourierDelete = async (courier) => {
    if (!window.confirm(`Delete "${courier.name}"? This cannot be undone.`)) return;
    setCourierDeleting(courier.id);
    try {
      await deleteCourier(courier.id);
      setCouriers((list) => list.filter((c) => c.id !== courier.id));
      showNotice(`${courier.name} removed.`);
    } catch (err) {
      setError(err.message || "Failed to delete courier.");
    } finally {
      setCourierDeleting(null);
    }
  };

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
    setPgSaveError("");
    if (gateway._static) {
      // Backend not yet implemented — open info-only modal
      setPgConfiguring(gateway);
      return;
    }
    try {
      const full = await fetchPaymentGatewayConfig(gateway.code);
      setPgConfiguring(full);
    } catch {
      setPgConfiguring(gateway);
    }
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

  const handleGoogleSave = async (form) => {
    setGoogleSaving(true);
    setGoogleError("");
    try {
      const payload = { enabled: form.enabled, clientId: form.clientId };
      if (form.clientSecret) payload.clientSecret = form.clientSecret;
      const updated = await saveGoogleOAuthConfig(payload);
      setGoogleConfig(updated);
      showNotice("Google OAuth settings saved.");
    } catch (err) {
      setGoogleError(err.message || "Failed to save Google OAuth settings.");
    } finally {
      setGoogleSaving(false);
    }
  };

  if (loading) return <LoadingBlock />;

  // Always show all GATEWAY_UI gateways — merge live API data where available
  const allGatewayCards = GATEWAY_DISPLAY_ORDER
    .filter((code) => GATEWAY_UI[code])
    .map((code) => {
      const live = paymentGateways.find((g) => g.code === code);
      if (live) return { ...live, _static: false };
      return {
        code,
        label: GATEWAY_UI[code].label,
        gatewayType: MANUAL_GATEWAY_CODES.includes(code) ? "manual" : "online",
        isEnabled: false,
        credentialsConfigured: false,
        instructions: {},
        _static: true
      };
    });

  const onlineGateways = allGatewayCards.filter((g) => g.gatewayType === "online");
  const manualGateways = allGatewayCards.filter((g) => g.gatewayType === "manual");

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

      {/* ── Google OAuth ── */}
      <GoogleOAuthSection
        config={googleConfig}
        saving={googleSaving}
        error={googleError}
        onSave={handleGoogleSave}
      />

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
        {[...couriers].sort((a, b) => (b._builtin ? 1 : 0) - (a._builtin ? 1 : 0)).map((courier) => (
          <CustomCourierCard
            key={courier.id}
            courier={courier}
            onToggle={() => handleCourierToggle(courier)}
            onEdit={() => { setCourierModal(courier); setCourierError(""); }}
            onDelete={courier._builtin ? null : () => handleCourierDelete(courier)}
            saving={courierDeleting === courier.id}
          />
        ))}
        <AddCourierCard onClick={() => { setCourierModal("add"); setCourierError(""); }} />
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
          isStatic={pgConfiguring._static}
        />
      )}

      {courierModal && (
        <CourierModal
          initial={courierModal === "add" ? null : courierModal}
          onSave={handleCourierSave}
          onClose={() => { setCourierModal(null); setCourierError(""); }}
          saving={courierSaving}
          error={courierError}
        />
      )}
    </div>
  );
}
