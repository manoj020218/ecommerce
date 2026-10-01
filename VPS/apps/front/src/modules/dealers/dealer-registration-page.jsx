import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { INDIA_GST_STATES } from "../../shared/india-gst-states";
import { usePublicSettings } from "../settings/public-settings-context";
import { getDealerFormOptions, registerDealer } from "./dealers.api";

// /dealer-registration (2026-10-01): regular buyers register their firm once
// and get a 5-digit dealer code (2-digit state + 3-digit number). Their firm,
// GST and address are then saved for every order we create for them.

const BRAND = "#E8231A";
const inputStyle = {
  width: "100%", boxSizing: "border-box", fontSize: 14, padding: "11px 12px",
  border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", fontFamily: "inherit"
};
const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 5 };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };
const card = { background: "#fff", border: "1px solid #eef0f3", borderRadius: 16, padding: 20, marginBottom: 16 };
const FALLBACK_TYPES = ["Dealer / Retailer", "Distributor / Stockist", "System Integrator / Installer", "Electrician / Contractor", "Builder / Developer", "Other"];

const EMPTY = {
  firmName: "", contactName: "", mobile: "", alternateMobile: "", email: "", gstin: "", businessType: "",
  addressLine1: "", addressLine2: "", city: "", stateCode: "", pincode: "", promotionsConsent: true, website: ""
};

function Field({ label, required, hint, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}{required ? <span style={{ color: BRAND }}> *</span> : null}</span>
      {children}
      {hint ? <span style={{ display: "block", fontSize: 12, color: "#6b7280", marginTop: 4 }}>{hint}</span> : null}
    </label>
  );
}

function Benefits() {
  const items = [
    ["⚡", "Faster orders", "Firm, GST and delivery address saved — no need to share them every time."],
    ["🧾", "Correct GST invoices", "Your GSTIN goes on every invoice automatically."],
    ["🏷️", "Dealer offers", "Be the first to hear about new products, stock and dealer schemes."],
    ["🤝", "Your own dealer code", "Quote it on call or WhatsApp and we know exactly who you are."]
  ];
  return (
    <div style={{ ...grid, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 18 }}>
      {items.map(([icon, title, text]) => (
        <div key={title} style={{ background: "#fff", border: "1px solid #eef0f3", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 22 }}>{icon}</div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#111827", margin: "4px 0" }}>{title}</div>
          <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{text}</div>
        </div>
      ))}
    </div>
  );
}

function Success({ result, whatsappNumber }) {
  const digits = String(whatsappNumber || "").replace(/[^\d]/g, "");
  const text = `Hi Jenix, my dealer code is ${result.dealerCode} (${result.firmName}).`;
  return (
    <div style={{ ...card, textAlign: "center", padding: "30px 20px" }}>
      <div style={{ fontSize: 40 }}>🎉</div>
      <h2 style={{ margin: "6px 0 4px", fontSize: 22 }}>{result.alreadyRegistered ? "You're already registered" : "Registration successful"}</h2>
      <p style={{ color: "#4b5563", margin: "0 0 16px" }}>{result.firmName}</p>
      <div style={{ display: "inline-block", border: `2px dashed ${BRAND}`, borderRadius: 14, padding: "14px 28px", background: "#fff7f7" }}>
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, letterSpacing: ".06em" }}>YOUR DEALER CODE</div>
        <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: 8, color: BRAND }}>{result.dealerCode}</div>
      </div>
      <p style={{ color: "#4b5563", fontSize: 14, maxWidth: 520, margin: "16px auto 18px", lineHeight: 1.6 }}>
        Please save this code and mention it whenever you order from us. {result.alreadyRegistered ? "" : "We have also sent it to your WhatsApp / email."}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {digits ? (
          <a href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
            style={{ background: "#16a34a", color: "#fff", padding: "12px 18px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>
            💬 Say hello on WhatsApp
          </a>
        ) : null}
        <Link to="/products" style={{ background: "#111827", color: "#fff", padding: "12px 18px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>
          Browse products
        </Link>
      </div>
    </div>
  );
}

export function DealerRegistrationPage() {
  const { settings } = usePublicSettings();
  const whatsappNumber = settings?.contactInformation?.publicWhatsApp || settings?.storeProfile?.whatsappNumber || "917240226566";
  const [form, setForm] = useState(EMPTY);
  const [types, setTypes] = useState(FALLBACK_TYPES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  useEffect(() => {
    const prev = document.title;
    document.title = "Dealer Registration | Jenix India";
    getDealerFormOptions().then((o) => { if (Array.isArray(o?.businessTypes) && o.businessTypes.length) setTypes(o.businessTypes); }).catch(() => {});
    return () => { document.title = prev; };
  }, []);

  // GSTIN's first two digits are the state code — pre-select the state from it.
  const onGstin = (e) => {
    const value = e.target.value.toUpperCase().replace(/\s/g, "");
    setForm((f) => ({ ...f, gstin: value, stateCode: /^\d{2}/.test(value) && INDIA_GST_STATES.some((s) => s.code === value.slice(0, 2)) ? value.slice(0, 2) : f.stateCode }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const data = await registerDealer(form);
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err?.message || "Could not register. Please check the details and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ background: "#f8fafc", paddingBottom: 40 }}>
      <section style={{ background: "linear-gradient(135deg,#0b1220,#1f2937)", color: "#fff" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#fca5a5" }}>JENIX DEALER NETWORK</div>
          <h1 style={{ fontSize: 30, margin: "8px 0 10px", lineHeight: 1.2 }}>Dealer Registration</h1>
          <p style={{ fontSize: 16, color: "#d1d5db", margin: 0, maxWidth: 680, lineHeight: 1.6 }}>
            Buy from us regularly? Register your firm once and get your own dealer code — your GST and delivery details are saved for every order.
          </p>
        </div>
      </section>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "22px 16px 0" }}>
        {result ? (
          <Success result={result} whatsappNumber={whatsappNumber} />
        ) : (
          <>
            <Benefits />
            <form onSubmit={submit} noValidate>
              <div style={card}>
                <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>Firm & contact</h2>
                <div style={grid}>
                  <Field label="Firm / shop name" required><input style={inputStyle} value={form.firmName} onChange={set("firmName")} autoComplete="organization" /></Field>
                  <Field label="Contact person" required><input style={inputStyle} value={form.contactName} onChange={set("contactName")} autoComplete="name" /></Field>
                  <Field label="Mobile / WhatsApp" required><input style={inputStyle} value={form.mobile} onChange={set("mobile")} inputMode="tel" placeholder="10-digit mobile" autoComplete="tel" /></Field>
                  <Field label="Alternate mobile"><input style={inputStyle} value={form.alternateMobile} onChange={set("alternateMobile")} inputMode="tel" /></Field>
                  <Field label="Email"><input style={inputStyle} value={form.email} onChange={set("email")} type="email" autoComplete="email" /></Field>
                  <Field label="Business type">
                    <select style={inputStyle} value={form.businessType} onChange={set("businessType")}>
                      <option value="">Select…</option>
                      {types.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <div style={card}>
                <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>GST & address</h2>
                <div style={grid}>
                  <Field label="GSTIN" hint="Leave empty if your firm is not GST registered.">
                    <input style={{ ...inputStyle, textTransform: "uppercase" }} value={form.gstin} onChange={onGstin} maxLength={15} placeholder="e.g. 08ABCDE1234F1Z5" />
                  </Field>
                  <Field label="State" required>
                    <select style={inputStyle} value={form.stateCode} onChange={set("stateCode")}>
                      <option value="">Select state…</option>
                      {INDIA_GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Address line 1" required><input style={inputStyle} value={form.addressLine1} onChange={set("addressLine1")} placeholder="Shop / building, street" autoComplete="address-line1" /></Field>
                  <Field label="Address line 2"><input style={inputStyle} value={form.addressLine2} onChange={set("addressLine2")} placeholder="Area, landmark" autoComplete="address-line2" /></Field>
                  <Field label="City" required><input style={inputStyle} value={form.city} onChange={set("city")} autoComplete="address-level2" /></Field>
                  <Field label="PIN code" required><input style={inputStyle} value={form.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} autoComplete="postal-code" /></Field>
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "12px 0 0" }}>This address is used for your GST invoice and as your default delivery address.</p>
              </div>

              {/* honeypot — hidden from real visitors */}
              <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true"
                style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />

              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#374151", margin: "4px 0 16px", cursor: "pointer" }}>
                <input type="checkbox" checked={form.promotionsConsent} onChange={set("promotionsConsent")} style={{ width: 18, height: 18, marginTop: 2 }} />
                <span>Send me new product updates and dealer offers on WhatsApp and email.</span>
              </label>

              {error ? <p style={{ color: "#b91c1c", fontWeight: 600, margin: "0 0 12px" }}>{error}</p> : null}
              <button type="submit" disabled={busy}
                style={{ border: "none", background: BRAND, color: "#fff", padding: "14px 26px", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>
                {busy ? "Registering…" : "Register & get my dealer code"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
