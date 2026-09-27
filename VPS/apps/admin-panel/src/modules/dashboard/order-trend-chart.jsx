import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchOrderTrend } from "./dashboard.api";

// Dashboard "Order Trend" with Week / Month / Year and Orders / Sales toggles.
// Replaces the fixed 7-day BarChart (kept in dashboard-page.jsx, unused).
// Week/Month bars link to Orders filtered to that IST day.

const BRAND = "#E8231A";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const RANGES = [
  { key: "week", label: "Week", title: "Last 7 Days" },
  { key: "month", label: "Month", title: "Last 30 Days" },
  { key: "year", label: "Year", title: "Last 12 Months" }
];

function fmtMoney(v) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function istDate(iso) {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "#f3f4f6", borderRadius: 8, padding: 2 }}>
      {options.map((o) => (
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

// weekFallback: the dashboard's existing last7DaysTrend, shown instantly
// while the Week data (which also carries sales) loads.
export function OrderTrendChart({ weekFallback = [] }) {
  const navigate = useNavigate();
  const [range, setRange] = useState("week");
  const [metric, setMetric] = useState("count");
  const [points, setPoints] = useState(
    weekFallback.map((d) => ({ label: d.day, date: d.date, count: d.count, revenue: d.revenue, sales: d.revenue }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetchOrderTrend(range)
      .then((res) => { if (alive) setPoints(Array.isArray(res?.points) ? res.points : []); })
      .catch(() => { if (alive) setError("Could not load trend"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  const valueOf = (p) => (metric === "count" ? p.count : p.sales);
  const maxVal = Math.max(...points.map(valueOf), 1);
  const totalCount = points.reduce((s, p) => s + p.count, 0);
  const totalSales = points.reduce((s, p) => s + p.sales, 0);
  const totalPaid = points.reduce((s, p) => s + p.revenue, 0);
  const daily = range !== "year";
  const denseLabels = points.length > 12;
  const title = RANGES.find((r) => r.key === range)?.title || "";

  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
      padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Order Trend — {title}</h3>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0" }}>
            {totalCount} orders · Sales {fmtMoney(totalSales)} · Paid {fmtMoney(totalPaid)}
            {loading ? " · loading…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Toggle value={metric} onChange={setMetric}
            options={[{ key: "count", label: "Orders" }, { key: "sales", label: "Sales ₹" }]} />
          <Toggle value={range} onChange={setRange} options={RANGES} />
        </div>
      </div>

      {error ? (
        <p style={{ textAlign: "center", color: "#b91c1c", fontSize: 13 }}>{error}</p>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: denseLabels ? 2 : 8, height: 140 }}>
          {points.map((p, i) => {
            const val = valueOf(p);
            const isLast = i === points.length - 1;
            const pct = (val / maxVal) * 100;
            const clickable = daily && p.count > 0;
            const tip = `${p.label}: ${p.count} orders · Sales ${fmtMoney(p.sales)} · Paid ${fmtMoney(p.revenue)}${clickable ? " — click to open orders" : ""}`;
            return (
              <div key={p.date || i} title={tip}
                onClick={clickable ? () => navigate(`/orders?date=${istDate(p.date)}`) : undefined}
                style={{
                  flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 5, height: "100%", cursor: clickable ? "pointer" : "default"
                }}>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                  <div style={{
                    width: "100%", height: `${Math.max(pct, val > 0 ? 5 : 2)}%`,
                    background: isLast ? BRAND : val === 0 ? "#e5e7eb" : "#fca5a5",
                    borderRadius: "4px 4px 0 0", transition: "height 0.4s ease"
                  }} />
                </div>
                {!denseLabels && val > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: isLast ? BRAND : "#9ca3af", marginBottom: -18, zIndex: 1 }}>
                    {metric === "count" ? p.count : fmtMoney(p.sales)}
                  </span>
                )}
                <span style={{
                  fontSize: denseLabels ? 9 : 11, whiteSpace: "nowrap",
                  color: isLast ? BRAND : "#9ca3af", fontWeight: isLast ? 700 : 400,
                  visibility: denseLabels && i % 5 !== 0 && !isLast ? "hidden" : "visible"
                }}>
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {!error && points.length === 0 && !loading && (
        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 16 }}>No order data yet</p>
      )}
    </div>
  );
}
