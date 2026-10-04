import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProductPerformance } from "./dashboard.api";
import { useAutoRefresh } from "./use-auto-refresh";

// Dashboard panel: product page visits vs real sales, to spot products that
// get attention but don't sell (price, photos, description, stock?) and
// products that sell well from few visits (worth promoting).

const BRAND = "#E8231A";

const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "365d", label: "1 year" }
];

const COLUMNS = [
  { key: "views", label: "Page views" },
  { key: "visitors", label: "Visitors" },
  { key: "orders", label: "Orders" },
  { key: "units", label: "Units" },
  { key: "revenue", label: "Revenue" },
  { key: "conversionPct", label: "Conversion" }
];

function fmtMoney(v) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function fmtDay(day) {
  if (!day) return "";
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Simple, explainable flags — thresholds keep tiny samples from shouting.
function insightFor(row) {
  if (row.visitors >= 20 && row.orders === 0) return { text: "High visits, no sales", bg: "#fee2e2", color: "#b91c1c" };
  if (row.visitors >= 20 && row.conversionPct !== null && row.conversionPct < 1) return { text: "High visits, low sales", bg: "#fef3c7", color: "#b45309" };
  if (row.orders >= 2 && row.conversionPct !== null && row.conversionPct >= 5) return { text: "Converting well", bg: "#dcfce7", color: "#15803d" };
  if (row.orders > 0 && row.views === 0) return { text: "Sold, visits not tracked", bg: "#f3f4f6", color: "#6b7280" };
  return null;
}

function Toggle({ value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "#f3f4f6", borderRadius: 8, padding: 2 }}>
      {RANGES.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} style={{
          border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
          padding: "5px 10px", borderRadius: 6,
          background: value === o.key ? "#fff" : "transparent",
          color: value === o.key ? BRAND : "#6b7280",
          boxShadow: value === o.key ? "0 1px 2px rgba(0,0,0,0.08)" : "none"
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Insight({ row }) {
  const i = insightFor(row);
  if (!i) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: i.bg, color: i.color, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {i.text}
    </span>
  );
}

function cellValue(row, key) {
  if (key === "revenue") return fmtMoney(row.revenue);
  if (key === "conversionPct") return row.conversionPct === null ? "—" : `${row.conversionPct}%`;
  return Number(row[key] || 0).toLocaleString("en-IN");
}

export function ProductPerformancePanel({ isMobile }) {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState("views");
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetchProductPerformance(range, 100)
      .then((res) => { if (alive) { setData(res); setUpdatedAt(new Date()); } })
      .catch(() => { if (alive) setError("Could not load product visits"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  // Live visits: silent re-fetch every 60 s while the tab is visible (the
  // backend counts views in memory, so each fetch includes the latest ones).
  // A response for a range the admin has since switched away from is dropped.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  useAutoRefresh(() => {
    const asked = rangeRef.current;
    fetchProductPerformance(asked, 100)
      .then((res) => { if (res && asked === rangeRef.current) { setData(res); setUpdatedAt(new Date()); } })
      .catch(() => {});
  });

  const rows = useMemo(() => {
    const list = Array.isArray(data?.rows) ? [...data.rows] : [];
    list.sort((a, b) => Number(b[sortKey] ?? -1) - Number(a[sortKey] ?? -1));
    return list.slice(0, 25);
  }, [data, sortKey]);

  const totals = data?.totals || { views: 0, visitors: 0, orders: 0, revenue: 0 };
  const overallConv = totals.visitors > 0 ? Math.round((totals.orders / totals.visitors) * 1000) / 10 : null;
  const trackingSince = data?.trackingSince;
  const partialPeriod = trackingSince && data?.fromDay && trackingSince > data.fromDay;

  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 20
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "16px 20px", borderBottom: "1px solid #f9fafb" }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Product Page Visits vs Sales</h3>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0" }}>
            {totals.views.toLocaleString("en-IN")} views · {totals.visitors.toLocaleString("en-IN")} visitors · {totals.orders} orders · {fmtMoney(totals.revenue)}
            {overallConv !== null ? ` · ${overallConv}% overall conversion` : ""}
            {loading ? " · loading…" : ""}
            {!loading && updatedAt ? ` · updated ${updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} (live, every minute)` : ""}
          </p>
        </div>
        <Toggle value={range} onChange={setRange} />
      </div>

      {(partialPeriod || !trackingSince) && !loading && (
        <div style={{ margin: "12px 20px 0", padding: "8px 12px", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, fontSize: 12 }}>
          {trackingSince
            ? `Visit tracking started on ${fmtDay(trackingSince)} — views before that are not counted, so conversion for this period is approximate.`
            : "Visit tracking has just started — product page views will appear here as visitors browse the store."}
        </div>
      )}

      {error ? (
        <div style={{ padding: "24px 20px", textAlign: "center", color: "#b91c1c", fontSize: 13 }}>{error}</div>
      ) : rows.length === 0 && !loading ? (
        <div style={{ padding: "28px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No product visits or sales in this period yet</div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
          {rows.map((r) => (
            <div key={r.productId} style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 12 }}>
              <Link to={`/products/${r.productId}/edit`} style={{ fontSize: 13, fontWeight: 600, color: "#1f2937", textDecoration: "none" }}>{r.title}</Link>
              <div style={{ margin: "6px 0" }}><Insight row={r} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 12, color: "#6b7280" }}>
                <span>👁 {r.views}</span><span>🧑 {r.visitors}</span><span>🛒 {r.orders}</span>
                <span>📦 {r.units}</span><span>{fmtMoney(r.revenue)}</span>
                <span style={{ fontWeight: 700, color: "#374151" }}>{cellValue(r, "conversionPct")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 16px" }}>Product</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} onClick={() => setSortKey(c.key)} title="Sort"
                    style={{
                      textAlign: "right", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      color: sortKey === c.key ? BRAND : "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 16px"
                    }}>
                    {c.label}{sortKey === c.key ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} style={{ borderBottom: "1px solid #f9fafb" }}>
                  <td style={{ padding: "10px 16px", maxWidth: 380 }}>
                    <Link to={`/products/${r.productId}/edit`} style={{ fontWeight: 600, color: "#1f2937", textDecoration: "none" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = BRAND; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#1f2937"; }}>
                      {r.title}
                    </Link>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                      {r.sku && <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{r.sku}</span>}
                      <Insight row={r} />
                    </div>
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} style={{
                      padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap",
                      fontWeight: c.key === "conversionPct" || c.key === sortKey ? 700 : 400,
                      color: c.key === "revenue" ? "#111827" : "#374151"
                    }}>
                      {cellValue(r, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 11, color: "#9ca3af", margin: 0, padding: "10px 20px 14px" }}>
        Website orders only (walk-in and cancelled orders excluded). Visitors = unique visitors per product per day; bots are not counted.
        Conversion = orders ÷ visitors.
      </p>
    </div>
  );
}
