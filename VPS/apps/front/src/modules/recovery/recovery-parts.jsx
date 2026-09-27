import { useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency, getSupportWhatsappLink } from "../account/account.utils";

// Building blocks for the customer-facing cart recovery page
// (recovery-resume-page.jsx). Inline styles, storefront brand colours.

export const BRAND = "#E8231A";
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#eef0f3";

export const cardStyle = {
  background: "#fff",
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(17,24,39,0.06)",
  padding: 18
};

// ─── "where you left off" progress ──────────────────────────────────────────
const STEPS = [
  { key: "cart", label: "Cart" },
  { key: "checkout", label: "Address & delivery" },
  { key: "payment", label: "Payment" },
  { key: "ordered", label: "Order placed" }
];

export function stepIndexFor(resumePoint) {
  if (resumePoint === "payment_failed") return 2;
  const i = STEPS.findIndex((s) => s.key === resumePoint);
  return i < 0 ? 0 : i;
}

export function ProgressSteps({ resumePoint }) {
  const current = stepIndexFor(resumePoint);
  const failed = resumePoint === "payment_failed";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, margin: "18px 0 4px" }}>
      {STEPS.map((step, i) => {
        const done = i < current || resumePoint === "ordered";
        const here = i === current && resumePoint !== "ordered";
        const dotBg = done ? "#16a34a" : here ? (failed ? "#f59e0b" : BRAND) : "#e5e7eb";
        return (
          <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: 0 }}>
            {i > 0 && (
              <span style={{
                position: "absolute", top: 13, right: "50%", width: "100%", height: 3,
                background: i <= current || resumePoint === "ordered" ? "#16a34a" : "#e5e7eb", zIndex: 0
              }} />
            )}
            <span style={{
              position: "relative", zIndex: 1, width: 28, height: 28, borderRadius: "50%",
              background: dotBg, color: done || here ? "#fff" : MUTED,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800,
              boxShadow: here ? `0 0 0 5px ${failed ? "rgba(245,158,11,0.18)" : "rgba(232,35,26,0.15)"}` : "none"
            }}>
              {done ? "✓" : i + 1}
            </span>
            <span style={{
              marginTop: 6, fontSize: 11, lineHeight: 1.25, textAlign: "center", padding: "0 2px",
              fontWeight: here ? 700 : 500, color: here ? INK : MUTED
            }}>
              {step.label}
            </span>
            {here && (
              <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: failed ? "#b45309" : BRAND, textAlign: "center" }}>
                {failed ? "Payment not completed" : "You stopped here"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── one saved product ──────────────────────────────────────────────────────
export function SavedItem({ item, detail }) {
  const [imgFailed, setImgFailed] = useState(false);
  const available = detail ? detail.available !== false : true;
  const href = detail?.slug ? `/products/${detail.slug}` : null;
  const qty = Math.max(1, Number(item.qty || 1));
  const basePrice = Number(item.finalUnitPrice || item.unitPrice || 0);
  const lineTotal = Number(item.lineTotal || basePrice * qty);
  // lineTotal includes GST while unitPrice doesn't — showing "1 × ₹11 = ₹12.98"
  // looked wrong, so the per-unit figure is derived from the line total.
  const price = lineTotal > 0 ? lineTotal / qty : basePrice;
  const title = href ? (
    <Link to={href} style={{ color: INK, textDecoration: "none" }}>{item.title}</Link>
  ) : item.title;

  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderTop: `1px solid ${LINE}` }}>
      <div style={{
        width: 76, height: 76, flexShrink: 0, borderRadius: 12, overflow: "hidden",
        background: "#f8fafc", border: `1px solid ${LINE}`,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        {detail?.imageUrl && !imgFailed ? (
          <img src={detail.imageUrl} alt={item.title} loading="lazy" onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: 28 }}>📦</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: INK }}>{title}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          Qty {item.qty} × {formatCurrency(price)} <span style={{ fontSize: 11 }}>(incl. GST)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: available ? "#dcfce7" : "#fee2e2", color: available ? "#15803d" : "#b91c1c"
          }}>
            {available ? "In stock — ready to ship" : "Currently unavailable"}
          </span>
          <strong style={{ fontSize: 15, color: INK }}>{formatCurrency(lineTotal)}</strong>
        </div>
      </div>
    </div>
  );
}

// ─── reassurance ────────────────────────────────────────────────────────────
export function TrustRow() {
  const items = [
    ["🧾", "GST invoice"],
    ["✅", "100% genuine"],
    ["🚚", "Pan-India delivery"],
    ["🔒", "Secure payment"]
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
      {items.map(([icon, text]) => (
        <div key={text} style={{
          display: "flex", alignItems: "center", gap: 8, background: "#f8fafc",
          border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#374151"
        }}>
          <span style={{ fontSize: 16 }}>{icon}</span>{text}
        </div>
      ))}
    </div>
  );
}

// ─── help before ordering ───────────────────────────────────────────────────
export function HelpBox({ support, cartItems }) {
  const itemsText = cartItems.map((i) => `${i.title} × ${i.qty}`).join(", ");
  const waLink = support.supportWhatsApp
    ? getSupportWhatsappLink(support.supportWhatsApp, `Hi, I have a question about the items in my cart: ${itemsText}`)
    : "";
  if (!waLink && !support.supportPhone && !support.supportEmail) return null;
  const btn = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10,
    fontSize: 13, fontWeight: 700, textDecoration: "none"
  };
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>Questions before you order?</div>
      <p style={{ fontSize: 13, color: MUTED, margin: "4px 0 12px" }}>
        Our team can help with bulk prices, GST billing, compatibility or installation.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {waLink && (
          <a href={waLink} target="_blank" rel="noreferrer" style={{ ...btn, background: "#16a34a", color: "#fff" }}>
            💬 Chat on WhatsApp
          </a>
        )}
        {support.supportPhone && (
          <a href={`tel:${support.supportPhone}`} style={{ ...btn, background: "#f3f4f6", color: INK }}>
            📞 Call {support.supportPhone}
          </a>
        )}
        {support.supportEmail && (
          <a href={`mailto:${support.supportEmail}`} style={{ ...btn, background: "#f3f4f6", color: INK }}>
            ✉️ Email us
          </a>
        )}
      </div>
    </div>
  );
}

// ─── optional "why not now" feedback (collapsed by default) ────────────────
const FRIENDLY_REASONS = {
  "payment problem": "Payment didn't work",
  "need GST invoice": "Need a GST invoice",
  "need installation support": "Need installation help",
  "confused about product": "Not sure it's the right product",
  "need bulk price": "Need a bulk price",
  "want WhatsApp/call support": "Want to talk to someone",
  "only checking price": "Just comparing prices"
};

export function FeedbackBox({ options, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div style={{ ...cardStyle, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
        Thanks for telling us — our team will use this to help you.
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 600, color: INK
      }}>
        Not ordering right now? Tell us why <span style={{ color: MUTED }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {options.map((reason) => (
              <button key={reason} type="button" disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy(reason);
                  try { await onSubmit(reason, note); setDone(true); } catch { /* error shown by page */ }
                  setBusy("");
                }}
                style={{
                  border: `1px solid #e5e7eb`, background: "#fff", borderRadius: 20, padding: "7px 12px",
                  fontSize: 12, fontWeight: 600, color: "#374151", cursor: busy ? "wait" : "pointer"
                }}>
                {busy === reason ? "Saving…" : FRIENDLY_REASONS[reason] || reason}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else? (optional)"
            style={{
              marginTop: 10, width: "100%", boxSizing: "border-box", border: "1px solid #e5e7eb",
              borderRadius: 10, padding: "9px 12px", fontSize: 13
            }} />
        </div>
      )}
    </div>
  );
}
