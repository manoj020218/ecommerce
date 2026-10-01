import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../shared/components/page-header";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import { fetchDealers } from "./dealers.api";
import { DealerDetail, DealerStatusBadge } from "./dealer-detail";

// Admin → Dealers (2026-10-01): everyone who registered at
// jenixindia.com/dealer-registration, with orders this month / this FY.

const REGISTRATION_URL = "https://jenixindia.com/dealer-registration";
const input = { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontFamily: "inherit" };

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows) {
  const header = ["Dealer code", "Status", "Firm", "Contact", "Mobile", "Alternate mobile", "Email", "GSTIN", "Business type", "City", "State", "PIN", "Offers consent", "Orders this month", "Value this month", "Orders this FY", "Value this FY", "Orders all time", "Value all time", "Last order", "Registered"];
  const lines = rows.map((r) => [
    r.dealer.code, r.dealer.status, r.dealer.firmName, r.dealer.contactName, r.mobile, r.dealer.alternateMobile, r.email, r.dealer.gstin,
    r.dealer.businessType, r.dealer.address.city, r.dealer.address.state, r.dealer.address.pincode, r.dealer.promotionsConsent ? "Yes" : "No",
    r.stats.monthCount, r.stats.monthValue, r.stats.fyCount, r.stats.fyValue, r.stats.totalCount, r.stats.totalValue,
    r.stats.lastOrderAt ? r.stats.lastOrderAt.slice(0, 10) : "", r.dealer.registeredAt ? r.dealer.registeredAt.slice(0, 10) : ""
  ].map(csvCell).join(","));
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `dealers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function DealersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    fetchDealers({ status }).then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => setError(e.message || "Failed to load dealers.")).finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.dealer.code, r.dealer.firmName, r.dealer.contactName, r.mobile, r.email, r.dealer.gstin, r.dealer.address.city]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }, [rows, q]);

  const totals = useMemo(() => filtered.reduce((t, r) => ({
    month: t.month + r.stats.monthValue, fy: t.fy + r.stats.fyValue, active: t.active + (r.stats.monthCount > 0 ? 1 : 0)
  }), { month: 0, fy: 0, active: 0 }), [filtered]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(REGISTRATION_URL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  if (openId) {
    return <DealerDetail customerId={openId} onClose={() => { setOpenId(""); load(); }} />;
  }

  return (
    <section className="stack">
      <PageHeader title="Dealers" description="Dealers who registered on the website. Their firm, GST and address are saved — search their dealer code, firm or mobile in Walk-in Orders." />

      <div className="summary-card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Registration link to share with dealers</div>
          <code style={{ fontSize: 13 }}>{REGISTRATION_URL}</code>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={copyLink}>{copied ? "✓ Copied" : "Copy link"}</button>
          <a className="btn btn-secondary" target="_blank" rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(`Register as a Jenix dealer to get your dealer code and faster ordering: ${REGISTRATION_URL}`)}`}>Share on WhatsApp</a>
        </div>
      </div>

      <div className="summary-grid">
        <article className="summary-card"><p>Dealers</p><h3>{filtered.length}</h3><span>{filtered.filter((r) => r.dealer.status === "pending").length} waiting for verification</span></article>
        <article className="summary-card"><p>Ordered this month</p><h3>{totals.active}</h3><span>dealers with at least 1 order</span></article>
        <article className="summary-card"><p>Dealer sales this month</p><h3>{formatCurrencyInr(totals.month)}</h3><span>excludes cancelled orders</span></article>
        <article className="summary-card"><p>Dealer sales this FY</p><h3>{formatCurrencyInr(totals.fy)}</h3><span>April – March</span></article>
      </div>

      <div className="summary-card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input style={{ ...input, flex: "1 1 220px" }} placeholder="Search code, firm, contact, mobile, GSTIN, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <button className="btn btn-secondary" disabled={!filtered.length} onClick={() => exportCsv(filtered)}>⬇ Export contacts (CSV)</button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <div style={{ fontSize: 14, color: "#6b7280" }}>Loading…</div> : !filtered.length ? (
          <div style={{ fontSize: 14, color: "#6b7280", padding: "8px 0" }}>No dealers yet. Share the registration link above with your regular buyers.</div>
        ) : (
          <>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr><th>Code</th><th>Firm</th><th>Contact</th><th>City</th><th>This month</th><th>This FY</th><th>Last order</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.customerId} onClick={() => setOpenId(r.customerId)} style={{ cursor: "pointer" }}>
                      <td><strong style={{ letterSpacing: 2, color: "#E8231A" }}>{r.dealer.code}</strong></td>
                      <td><strong>{r.dealer.firmName}</strong><p className="row-sub">{r.dealer.gstin || "No GSTIN"}</p></td>
                      <td>{r.dealer.contactName}<p className="row-sub">{r.mobile}</p></td>
                      <td>{r.dealer.address.city}<p className="row-sub">{r.dealer.address.state}</p></td>
                      <td>{formatCurrencyInr(r.stats.monthValue)}<p className="row-sub">{r.stats.monthCount} orders</p></td>
                      <td>{formatCurrencyInr(r.stats.fyValue)}<p className="row-sub">{r.stats.fyCount} orders</p></td>
                      <td>{r.stats.lastOrderAt ? formatDateTime(r.stats.lastOrderAt) : "—"}</td>
                      <td><DealerStatusBadge status={r.dealer.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-cards">
              {filtered.map((r) => (
                <article key={r.customerId} className="card" onClick={() => setOpenId(r.customerId)} style={{ cursor: "pointer" }}>
                  <div className="card-head"><h4>{r.dealer.code} · {r.dealer.firmName}</h4><DealerStatusBadge status={r.dealer.status} /></div>
                  <p className="muted">{r.dealer.contactName} · {r.mobile} · {r.dealer.address.city}</p>
                  <p className="muted">This month {formatCurrencyInr(r.stats.monthValue)} ({r.stats.monthCount}) · FY {formatCurrencyInr(r.stats.fyValue)}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
