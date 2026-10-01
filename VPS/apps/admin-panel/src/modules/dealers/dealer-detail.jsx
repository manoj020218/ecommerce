import { useEffect, useState } from "react";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import { fetchDealer, updateDealer } from "./dealers.api";

// One dealer: verify, edit details, last-12-months orders, recent orders.

const BRAND = "#E8231A";
const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontFamily: "inherit" };
const label = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", margin: "10px 0 4px" };
const STATUS_COLORS = { pending: ["#fef3c7", "#92400e"], verified: ["#dcfce7", "#166534"], rejected: ["#fee2e2", "#991b1b"] };

export function DealerStatusBadge({ status }) {
  const [bg, fg] = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 10, textTransform: "capitalize" }}>{status || "pending"}</span>;
}

function MonthBars({ months }) {
  const max = Math.max(1, ...months.map((m) => m.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "8px 0" }}>
      {months.map((m) => (
        <div key={m.key} title={`${m.key}: ${m.count} orders · ${formatCurrencyInr(m.value)}`} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ height: Math.max(2, (m.value / max) * 90), background: m.value ? BRAND : "#e5e7eb", borderRadius: 4 }} />
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>{m.key.slice(5)}/{m.key.slice(2, 4)}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{m.count || ""}</div>
        </div>
      ))}
    </div>
  );
}

export function DealerDetail({ customerId, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetchDealer(customerId).then((d) => {
      if (!alive) return;
      setData(d);
      const p = d.dealer;
      setForm({
        firmName: p.firmName, contactName: p.contactName, alternateMobile: p.alternateMobile, gstin: p.gstin,
        businessType: p.businessType, addressLine1: p.address.addressLine1, addressLine2: p.address.addressLine2,
        city: p.address.city, pincode: p.address.pincode, notes: p.notes, promotionsConsent: p.promotionsConsent
      });
    }).catch((e) => setError(e.message || "Failed to load dealer."));
    return () => { alive = false; };
  }, [customerId]);

  const save = async (extra = {}) => {
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await updateDealer(customerId, { ...form, ...extra });
      setData((d) => ({ ...d, ...updated }));
      setNotice("Saved.");
      onSaved?.(updated);
    } catch (e) {
      setError(e.message || "Save failed.");
    }
    setSaving(false);
  };

  if (error && !data) return <div className="summary-card"><p className="form-error">{error}</p><button className="btn btn-secondary" onClick={onClose}>Back</button></div>;
  if (!data || !form) return <div className="summary-card"><p className="muted">Loading…</p></div>;

  const d = data.dealer;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const wa = String(data.mobile || d.mobile || "").replace(/[^\d]/g, "");
  const waNumber = wa.length === 10 ? `91${wa}` : wa;

  return (
    <div className="stack">
      <div className="summary-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 4, color: BRAND }}>{d.code}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{d.firmName} <DealerStatusBadge status={d.status} /></div>
            <div className="muted" style={{ fontSize: 13 }}>{d.contactName} · {data.mobile} {data.email ? `· ${data.email}` : ""}</div>
            <div className="muted" style={{ fontSize: 12 }}>Registered {formatDateTime(d.registeredAt)}{d.verifiedAt ? ` · verified ${formatDateTime(d.verifiedAt)}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {waNumber ? <a className="btn btn-secondary" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">WhatsApp</a> : null}
            {data.email ? <a className="btn btn-secondary" href={`mailto:${data.email}`}>Email</a> : null}
            {d.status !== "verified" ? <button className="btn btn-primary" disabled={saving} onClick={() => save({ status: "verified" })}>✓ Mark verified</button> : null}
            {d.status !== "rejected" ? <button className="btn btn-secondary" disabled={saving} onClick={() => save({ status: "rejected" })}>Reject</button> : null}
            <button className="btn btn-secondary" onClick={onClose}>← All dealers</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>Verifying does not change prices — dealers are priced per order in Walk-in Orders, like any walk-in customer.</p>
      </div>

      <div className="summary-grid">
        <article className="summary-card"><p>This month</p><h3>{formatCurrencyInr(data.stats.monthValue)}</h3><span>{data.stats.monthCount} orders</span></article>
        <article className="summary-card"><p>This FY (Apr–Mar)</p><h3>{formatCurrencyInr(data.stats.fyValue)}</h3><span>{data.stats.fyCount} orders</span></article>
        <article className="summary-card"><p>All time</p><h3>{formatCurrencyInr(data.stats.totalValue)}</h3><span>{data.stats.totalCount} orders</span></article>
        <article className="summary-card"><p>Last order</p><h3 style={{ fontSize: 16 }}>{data.stats.lastOrderAt ? formatDateTime(data.stats.lastOrderAt) : "—"}</h3><span>&nbsp;</span></article>
      </div>

      <div className="summary-card">
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Orders — last 12 months</div>
        <MonthBars months={data.months || []} />
        {data.recentOrders?.length ? (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.id}><td><strong>{o.orderNo}</strong></td><td>{formatDateTime(o.date)}</td><td>{o.orderStatus || o.paymentStatus}</td><td>{formatCurrencyInr(o.grandTotal)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No orders yet.</p>}
      </div>

      <div className="summary-card">
        <div style={{ fontWeight: 800 }}>Dealer details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 14px" }}>
          <div><label style={label}>Firm name</label><input style={input} value={form.firmName} onChange={set("firmName")} /></div>
          <div><label style={label}>Contact person</label><input style={input} value={form.contactName} onChange={set("contactName")} /></div>
          <div><label style={label}>Alternate mobile</label><input style={input} value={form.alternateMobile} onChange={set("alternateMobile")} /></div>
          <div><label style={label}>GSTIN</label><input style={{ ...input, textTransform: "uppercase" }} value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} /></div>
          <div><label style={label}>Business type</label><input style={input} value={form.businessType} readOnly /></div>
          <div><label style={label}>State</label><input style={input} value={d.address.state} readOnly title="State is part of the dealer code and can't be changed" /></div>
          <div><label style={label}>Address line 1</label><input style={input} value={form.addressLine1} onChange={set("addressLine1")} /></div>
          <div><label style={label}>Address line 2</label><input style={input} value={form.addressLine2} onChange={set("addressLine2")} /></div>
          <div><label style={label}>City</label><input style={input} value={form.city} onChange={set("city")} /></div>
          <div><label style={label}>PIN code</label><input style={input} value={form.pincode} onChange={set("pincode")} /></div>
        </div>
        <label style={label}>Internal notes</label>
        <textarea style={input} rows={3} value={form.notes} onChange={set("notes")} placeholder="e.g. usual credit terms, preferred courier, products they buy" />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 10 }}>
          <input type="checkbox" checked={form.promotionsConsent} onChange={set("promotionsConsent")} /> Agreed to receive offers on WhatsApp / email
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="alert-info">{notice}</p> : null}
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={saving} onClick={() => save()}>{saving ? "Saving…" : "Save details"}</button>
        </div>
      </div>
    </div>
  );
}
