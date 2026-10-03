import { useEffect, useState } from "react";
import { PageHeader } from "../../shared/components/page-header";
import { formatDateTime } from "../../shared/utils/formatters";
import { fetchAppNotificationSummary, sendAppNotification } from "./app-notifications.api";

// Marketing → App Notifications (2026-10-03): send an offer / new product /
// announcement as a phone notification to buyers who switched notifications
// on in the Jenix app or website. Order updates go automatically — this page
// is only for promotions.

const BRAND = "#E8231A";
const input = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, fontFamily: "inherit" };
const label = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", margin: "12px 0 5px" };
const AUDIENCE_LABELS = { all: "Everyone with notifications on", customers_with_orders: "Customers who have ordered", dealers: "Registered dealers" };
const WEEKLY_SOFT_LIMIT = 2;

function Preview({ title, body, image }) {
  return (
    <div style={{ background: "#1f2937", borderRadius: 14, padding: 12, color: "#fff", maxWidth: 360 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <img src="https://jenixindia.com/icons/icon-192.png" alt="" width={34} height={34} style={{ borderRadius: 8, background: "#fff" }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>Jenix India · now</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title || "Jenix India"}</div>
          <div style={{ fontSize: 13, color: "#e5e7eb", lineHeight: 1.4 }}>{body || "Your message…"}</div>
        </div>
      </div>
      {image ? <img src={image} alt="" style={{ width: "100%", borderRadius: 10, marginTop: 10, maxHeight: 170, objectFit: "cover" }} /> : null}
    </div>
  );
}

export function AppNotificationsPage() {
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", url: "/products", image: "", audience: "all" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = () => fetchAppNotificationSummary().then(setSummary).catch((e) => setError(e.message || "Failed to load."));
  useEffect(() => { load(); }, []);

  const reach = summary?.audienceCounts?.[form.audience] ?? 0;
  const overLimit = (summary?.sentLast7Days || 0) >= WEEKLY_SOFT_LIMIT;

  const send = async () => {
    setError(""); setNotice("");
    if (!form.body.trim()) { setError("Please write the message."); return; }
    const warn = overLimit
      ? `\n\nYou already sent ${summary.sentLast7Days} offer notification(s) in the last 7 days. Too many make people switch them off.`
      : "";
    if (!window.confirm(`Send this notification to ${reach} phone(s)?${warn}`)) return;
    setBusy(true);
    try {
      const r = await sendAppNotification(form);
      setNotice(`Sent to ${r.sent} phone(s)${r.failed ? ` · ${r.failed} failed` : ""}${r.removed ? ` · ${r.removed} old phone(s) removed` : ""}.`);
      setForm((f) => ({ ...f, title: "", body: "", image: "" }));
      load();
    } catch (e) {
      setError(e.message || "Sending failed.");
    }
    setBusy(false);
  };

  return (
    <section className="stack">
      <PageHeader
        title="App Notifications"
        description="Send offers, new products or announcements as a phone notification. Order updates (payment, packed, shipped, delivered) are sent automatically, so there is no need to send them here."
      />

      <div className="summary-grid">
        <article className="summary-card"><p>Phones with notifications on</p><h3>{summary?.phones ?? "—"}</h3><span>{summary?.customers ?? 0} customers</span></article>
        <article className="summary-card"><p>Customers who ordered</p><h3>{summary?.audienceCounts?.customers_with_orders ?? "—"}</h3><span>phones</span></article>
        <article className="summary-card"><p>Dealers</p><h3>{summary?.audienceCounts?.dealers ?? "—"}</h3><span>phones</span></article>
        <article className="summary-card"><p>Offers sent (7 days)</p><h3 style={{ color: overLimit ? "#b45309" : undefined }}>{summary?.sentLast7Days ?? "—"}</h3><span>keep it to {WEEKLY_SOFT_LIMIT} a week</span></article>
      </div>

      <div className="summary-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>New notification</div>
          <label style={label}>Title <span style={{ fontWeight: 400, color: "#6b7280" }}>(max 80)</span></label>
          <input style={input} maxLength={80} value={form.title} onChange={set("title")} placeholder="e.g. 🎉 Diwali offer — 10% off CCTV kits" />
          <label style={label}>Message <span style={{ fontWeight: 400, color: "#6b7280" }}>(max 240)</span></label>
          <textarea style={input} rows={3} maxLength={240} value={form.body} onChange={set("body")} placeholder="e.g. Hikvision and CP Plus kits at dealer prices till Sunday. Tap to shop." />
          <label style={label}>Opens this page when tapped</label>
          <input style={input} value={form.url} onChange={set("url")} placeholder="/products or a product link from jenixindia.com" />
          <label style={label}>Image link <span style={{ fontWeight: 400, color: "#6b7280" }}>(optional, https — shows on Android)</span></label>
          <input style={input} value={form.image} onChange={set("image")} placeholder="https://api.jenixindia.com/static/uploads/…" />
          <label style={label}>Send to</label>
          <select style={input} value={form.audience} onChange={set("audience")}>
            {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v} ({summary?.audienceCounts?.[k] ?? 0})</option>)}
          </select>
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="alert-info">{notice}</p> : null}
          <button type="button" className="btn btn-primary" style={{ marginTop: 14, background: BRAND }} disabled={busy || !reach} onClick={send}>
            {busy ? "Sending…" : `Send to ${reach} phone(s)`}
          </button>
          {!reach ? <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>No phones in this group have notifications on yet.</div> : null}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Preview</div>
          <Preview title={form.title} body={form.body} image={/^https:\/\//.test(form.image) ? form.image : ""} />
        </div>
      </div>

      <div className="summary-card">
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Sent offers</div>
        {summary?.history?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Notification</th><th>Sent to</th><th>Delivered</th></tr></thead>
              <tbody>
                {summary.history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDateTime(h.createdAt)}</td>
                    <td><strong>{h.title}</strong><p className="row-sub">{h.body}</p></td>
                    <td>{AUDIENCE_LABELS[h.audience] || h.audience}</td>
                    <td>{h.sent} / {h.phones}{h.failed ? ` · ${h.failed} failed` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ fontSize: 14, color: "#6b7280" }}>Nothing sent yet.</div>}
      </div>
    </section>
  );
}
