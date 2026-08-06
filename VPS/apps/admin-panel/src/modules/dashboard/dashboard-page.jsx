import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardStats } from "./dashboard.api";

const BRAND = "#E8231A";
const BRAND_DARK = "#C41D15";

// ─── responsive hook ──────────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(v) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── status pill ──────────────────────────────────────────────────────────────
const STATUS_MAP = {
  // payment
  paid:       { bg: "#dcfce7", color: "#15803d", dot: "#16a34a" },
  pending:    { bg: "#fef9c3", color: "#a16207", dot: "#ca8a04" },
  failed:     { bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
  refunded:   { bg: "#f5f3ff", color: "#6d28d9", dot: "#8b5cf6" },
  // shipment
  awaiting:   { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" },
  processing: { bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  packing:    { bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  shipped:    { bg: "#f5f3ff", color: "#6d28d9", dot: "#8b5cf6" },
  out_for_delivery: { bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  delivered:  { bg: "#dcfce7", color: "#15803d", dot: "#16a34a" },
  fulfilled:  { bg: "#dcfce7", color: "#15803d", dot: "#16a34a" },
  cancelled:  { bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
};

function StatusPill({ value }) {
  const key = String(value || "pending").toLowerCase();
  const s = STATUS_MAP[key] || { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" };
  const label = key.replace(/_/g, " ");
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 20,
      whiteSpace: "nowrap", textTransform: "capitalize"
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── SVG donut chart ──────────────────────────────────────────────────────────
const DONUT_COLORS = [BRAND, "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"];

function DonutChart({ segments }) {
  if (!segments || segments.length === 0) {
    return (
      <svg viewBox="0 0 36 36" style={{ width: 104, height: 104 }}>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3.8" />
        <text x="18" y="20" textAnchor="middle" style={{ fontSize: 3.5, fill: "#9ca3af", fontFamily: "Inter,sans-serif" }}>No data</text>
      </svg>
    );
  }
  let cumulative = 0;
  return (
    <svg viewBox="0 0 36 36" style={{ width: 104, height: 104, transform: "rotate(-90deg)" }}>
      {segments.map((seg, i) => {
        const dashLen = (seg.pct / 100) * 100;
        const dashGap = 100 - dashLen;
        const dashOffset = -cumulative;
        cumulative += dashLen;
        return (
          <circle key={i}
            cx="18" cy="18" r="15.9"
            fill="none"
            stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
            strokeWidth="3.8"
            strokeDasharray={`${dashLen} ${dashGap}`}
            strokeDashoffset={dashOffset}
          />
        );
      })}
    </svg>
  );
}

// ─── stat card ────────────────────────────────────────────────────────────────
function StatCard({ emoji, iconBg, value, label, badge, badgeBg, badgeColor }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
      padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, background: iconBg, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
        }}>
          {emoji}
        </div>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: badgeBg, color: badgeColor,
            padding: "2px 8px", borderRadius: 20
          }}>
            {badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: 26, fontWeight: 800, color: "#111827", lineHeight: 1, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, margin: "4px 0 0" }}>{label}</p>
    </div>
  );
}

// ─── bar chart ────────────────────────────────────────────────────────────────
function BarChart({ trend }) {
  const maxCount = Math.max(...trend.map((d) => d.count), 1);
  const total = trend.reduce((s, d) => s + d.count, 0);

  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
      padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Order Trend — Last 7 Days</h3>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0" }}>Total: {total} orders</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
        {trend.map((d, i) => {
          const isToday = i === trend.length - 1;
          const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          return (
            <div key={i} title={`${d.day}: ${d.count} orders · ${fmtMoney(d.revenue)}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, height: "100%" }}>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%",
                  height: `${Math.max(pct, 5)}%`,
                  background: isToday ? BRAND : d.count === 0 ? "#e5e7eb" : "#fca5a5",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.4s ease"
                }} />
              </div>
              {/* count label on top of bar */}
              {d.count > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? BRAND : "#9ca3af", marginBottom: -18, zIndex: 1 }}>
                  {d.count}
                </span>
              )}
              <span style={{ fontSize: 11, color: isToday ? BRAND : "#9ca3af", fontWeight: isToday ? 700 : 400 }}>
                {d.day}
              </span>
            </div>
          );
        })}
      </div>
      {trend.length === 0 && (
        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 16 }}>No order data yet</p>
      )}
    </div>
  );
}

// ─── payment donut panel ──────────────────────────────────────────────────────
function PaymentDonut({ breakdown }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
      padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>Payment Methods</h3>
      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 14px" }}>Last 30 days</p>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, position: "relative" }}>
        <DonutChart segments={breakdown} />
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none"
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>30d</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {breakdown.length === 0 ? (
          <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>No payment data yet</p>
        ) : (
          breakdown.map((b, i) => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#6b7280" }}>{b.label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{b.pct}%</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── recent orders table ──────────────────────────────────────────────────────
function OrderRow({ o }) {
  const isPendingPay = ["pending", "verify_pending"].includes(String(o.paymentStatus || "").toLowerCase());
  return (
    <tr
      style={{ borderBottom: "1px solid #f9fafb", background: isPendingPay ? "rgba(251,191,36,0.04)" : "transparent" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = isPendingPay ? "rgba(251,191,36,0.10)" : "#f9fafb"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isPendingPay ? "rgba(251,191,36,0.04)" : "transparent"; }}
    >
      <td style={{ padding: "11px 16px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: BRAND, whiteSpace: "nowrap" }}>
        {o.orderNo || `#${String(o.orderId || "").slice(-8)}`}
      </td>
      <td style={{ padding: "11px 16px" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "#1f2937", fontSize: 13 }}>{o.customerName}</p>
        {o.customerCity && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{o.customerCity}</p>}
      </td>
      <td style={{ padding: "11px 16px", fontWeight: 700, color: "#111827", whiteSpace: "nowrap", fontSize: 13 }}>
        {fmtMoney(o.grandTotal)}
      </td>
      <td style={{ padding: "11px 16px" }}>
        <StatusPill value={o.paymentStatus} />
      </td>
      <td style={{ padding: "11px 16px" }}>
        <StatusPill value={o.shipmentStatus || "pending"} />
      </td>
      <td style={{ padding: "11px 16px", fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
        {fmtDate(o.createdAt)}
      </td>
      <td style={{ padding: "11px 16px" }}>
        <Link to={`/orders/${o.orderId}`}
          style={{ fontSize: 12, fontWeight: 600, color: BRAND, textDecoration: "none" }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
        >
          View
        </Link>
      </td>
    </tr>
  );
}

function OrderCard({ o }) {
  const isPendingPay = ["pending", "verify_pending"].includes(String(o.paymentStatus || "").toLowerCase());
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${isPendingPay ? "#fcd34d" : "#f3f4f6"}`,
      borderRadius: 14,
      padding: 14,
      background: isPendingPay ? "rgba(255,251,235,0.6)" : "#fff"
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <p style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: BRAND, margin: 0 }}>
            {o.orderNo || `#${String(o.orderId || "").slice(-8)}`}
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1f2937", margin: "2px 0 0" }}>{o.customerName}</p>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "1px 0 0" }}>{fmtDate(o.createdAt)}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: BRAND, margin: 0 }}>{fmtMoney(o.grandTotal)}</p>
          <div style={{ marginTop: 4 }}>
            <StatusPill value={o.paymentStatus} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <StatusPill value={o.shipmentStatus || "pending"} />
        <Link to={`/orders/${o.orderId}`}
          style={{
            fontSize: 12, fontWeight: 600, color: "#fff",
            background: BRAND, padding: "5px 14px", borderRadius: 8,
            textDecoration: "none"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND_DARK; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND; }}
        >
          View →
        </Link>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const width = useWindowWidth();
  const isMobile = width < 768;

  useEffect(() => {
    // fetchDashboardStats() already goes through apiFetch, which unwraps
    // the {ok, data} envelope itself and resolves directly to the stats
    // object — `.then((res) => setStats(res.data))` was reading .data a
    // second time off an object that no longer had one, so setStats(undefined)
    // fired on every load and every card silently fell back to its zero/empty
    // state, no matter what the backend actually returned.
    fetchDashboardStats()
      .then((res) => setStats(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  if (loading) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
        Loading dashboard…
      </div>
    );
  }

  const trend = stats?.last7DaysTrend || [];
  const breakdown = stats?.paymentBreakdown || [];
  const recentOrders = stats?.recentOrders || [];

  return (
    <div style={{ padding: isMobile ? "16px" : "20px 24px" }}>

      {/* ── header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, color: "#111827", margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{today}</p>
      </div>

      {/* ── stats cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: isMobile ? 12 : 16,
        marginBottom: 20
      }}>
        <StatCard emoji="📦" iconBg="#dbeafe" value={stats?.todayOrderCount ?? 0}
          label="Today's Orders"
          badge={stats?.todayOrderCount > 0 ? "Live" : undefined}
          badgeBg="#dcfce7" badgeColor="#15803d"
        />
        <StatCard emoji="₹" iconBg="#dcfce7" value={fmtMoney(stats?.todayRevenue ?? 0)}
          label="Today's Revenue"
          badge={stats?.todayRevenue > 0 ? "+Today" : undefined}
          badgeBg="#dcfce7" badgeColor="#15803d"
        />
        <StatCard emoji="⏳" iconBg="#fef3c7" value={stats?.pendingPayments ?? 0}
          label="Pending Payments"
          badge={stats?.pendingPayments > 0 ? "Action" : undefined}
          badgeBg="#fef3c7" badgeColor="#b45309"
        />
        <StatCard emoji="⚠️" iconBg="#fee2e2" value={stats?.lowStockCount ?? 0}
          label="Low / Out of Stock"
          badge={stats?.lowStockCount > 0 ? "Alert" : undefined}
          badgeBg="#fee2e2" badgeColor={BRAND}
        />
      </div>

      {/* ── quick actions ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: isMobile ? 10 : 12,
        marginBottom: 20
      }}>
        {[
          { label: "Process Orders", emoji: "📋", bg: "#dbeafe", to: "/orders" },
          { label: "Verify Payments", emoji: "✅", bg: "#fef3c7", to: "/orders" },
          { label: "Add Product",     emoji: "➕", bg: "#dcfce7", to: "/products/add" },
          { label: "View Reports",    emoji: "📊", bg: "#f3e8ff", to: "/reports" }
        ].map((a) => (
          <Link key={a.label} to={a.to} style={{ textDecoration: "none" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#fff", border: "1px solid #f3f4f6",
              borderRadius: 12, padding: isMobile ? "10px 12px" : "12px 14px",
              cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s"
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = BRAND;
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(232,35,26,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#f3f4f6";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{
                width: 34, height: 34, background: a.bg, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0
              }}>
                {a.emoji}
              </div>
              <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 500, color: "#374151" }}>{a.label}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* ── charts row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
        gap: 16,
        marginBottom: 20
      }}>
        <BarChart trend={trend} />
        <PaymentDonut breakdown={breakdown} />
      </div>

      {/* ── recent orders ── */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        overflow: "hidden"
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #f9fafb"
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Recent Orders</h3>
          <Link to="/orders" style={{ fontSize: 13, fontWeight: 600, color: BRAND, textDecoration: "none" }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
          >
            View all →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            No orders yet
          </div>
        ) : isMobile ? (
          /* mobile cards */
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
            {recentOrders.map((o) => <OrderCard key={o.orderId} o={o} />)}
          </div>
        ) : (
          /* desktop table */
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  {["Order #", "Customer", "Amount", "Payment", "Shipment", "Date", ""].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", fontSize: 11, fontWeight: 600,
                      color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em",
                      padding: "10px 16px", whiteSpace: "nowrap"
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => <OrderRow key={o.orderId} o={o} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
