import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardStats } from "./dashboard.api";

const BRAND = "#E8231A";

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

const PAYMENT_STATUS_STYLES = {
  paid: { background: "#f0fdf4", color: "#15803d" },
  pending: { background: "#fffbeb", color: "#b45309" },
  failed: { background: "#fef2f2", color: "#b91c1c" },
  refunded: { background: "#f5f3ff", color: "#6d28d9" },
  cod: { background: "#f0fdf4", color: "#15803d" }
};

const SHIPMENT_STATUS_STYLES = {
  pending: { background: "#f3f4f6", color: "#6b7280" },
  processing: { background: "#eff6ff", color: "#1d4ed8" },
  packing: { background: "#eff6ff", color: "#1d4ed8" },
  shipped: { background: "#f5f3ff", color: "#6d28d9" },
  out_for_delivery: { background: "#fff7ed", color: "#c2410c" },
  delivered: { background: "#f0fdf4", color: "#15803d" },
  fulfilled: { background: "#f0fdf4", color: "#15803d" },
  cancelled: { background: "#fef2f2", color: "#b91c1c" }
};

function StatusPill({ label, styles }) {
  return (
    <span style={{
      ...styles,
      fontSize: 11,
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 20,
      whiteSpace: "nowrap",
      textTransform: "capitalize"
    }}>
      {label}
    </span>
  );
}

// Donut chart via SVG
const DONUT_COLORS = ["#E8231A", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"];
function DonutChart({ segments }) {
  if (!segments || segments.length === 0) {
    return (
      <svg viewBox="0 0 36 36" style={{ width: 112, height: 112 }}>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3.8" />
        <text x="18" y="19" textAnchor="middle" style={{ fontSize: 4, fill: "#6b7280" }}>No data</text>
      </svg>
    );
  }

  let offset = 0;
  const total = segments.reduce((s, seg) => s + seg.pct, 0) || 100;
  const paths = segments.map((seg, i) => {
    const da = `${(seg.pct / 100) * 100} ${100 - (seg.pct / 100) * 100}`;
    const path = (
      <circle
        key={i}
        cx="18" cy="18" r="15.9"
        fill="none"
        stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
        strokeWidth="3.8"
        strokeDasharray={da}
        strokeDashoffset={-offset}
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
      />
    );
    offset += (seg.pct / 100) * 100;
    return path;
  });

  return (
    <svg viewBox="0 0 36 36" style={{ width: 112, height: 112 }}>
      {paths}
    </svg>
  );
}

function StatCard({ icon, iconBg, iconColor, value, label, badge, badgeColor }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      border: "1px solid #f3f4f6",
      padding: 16,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{
          width: 40, height: 40,
          background: iconBg,
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0
        }}>
          <span style={{ fontSize: 18, color: iconColor }}>{icon}</span>
        </div>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: badgeColor === "red" ? "#fef2f2" : badgeColor === "amber" ? "#fffbeb" : "#f0fdf4",
            color: badgeColor === "red" ? BRAND : badgeColor === "amber" ? "#b45309" : "#15803d",
            padding: "2px 8px", borderRadius: 20
          }}>
            {badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: 26, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{label}</p>
    </div>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats()
      .then((res) => setStats(res.data))
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
  const maxCount = Math.max(...trend.map((t) => t.count), 1);
  const breakdown = stats?.paymentBreakdown || [];
  const recentOrders = stats?.recentOrders || [];

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{today}</p>
      </div>

      {/* Stats cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 16,
        marginBottom: 20
      }}>
        <StatCard
          icon="📦"
          iconBg="#dbeafe"
          iconColor="#2563eb"
          value={stats?.todayOrderCount ?? 0}
          label="Today's Orders"
          badge={stats?.todayOrderCount > 0 ? "Live" : null}
          badgeColor="green"
        />
        <StatCard
          icon="₹"
          iconBg="#dcfce7"
          iconColor="#16a34a"
          value={fmtMoney(stats?.todayRevenue ?? 0)}
          label="Today's Revenue"
          badge={stats?.todayRevenue > 0 ? "+Today" : null}
          badgeColor="green"
        />
        <StatCard
          icon="⏳"
          iconBg="#fef3c7"
          iconColor="#d97706"
          value={stats?.pendingPayments ?? 0}
          label="Pending Payments"
          badge={stats?.pendingPayments > 0 ? "Action" : null}
          badgeColor="amber"
        />
        <StatCard
          icon="⚠️"
          iconBg="#fee2e2"
          iconColor={BRAND}
          value={stats?.lowStockCount ?? 0}
          label="Low / Out of Stock"
          badge={stats?.lowStockCount > 0 ? "Alert" : null}
          badgeColor="red"
        />
      </div>

      {/* Quick actions */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
        marginBottom: 20
      }}>
        {[
          { label: "Process Orders", icon: "📋", color: "#dbeafe", iconColor: "#2563eb", to: "/orders" },
          { label: "Verify Payments", icon: "✅", color: "#fef3c7", iconColor: "#d97706", to: "/orders?paymentStatus=pending" },
          { label: "Add Product", icon: "➕", color: "#dcfce7", iconColor: "#16a34a", to: "/products/add" },
          { label: "View Reports", icon: "📊", color: "#f3e8ff", iconColor: "#7c3aed", to: "/reports" }
        ].map((a) => (
          <Link
            key={a.label}
            to={a.to}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#fff", border: "1px solid #f3f4f6",
              borderRadius: 12, padding: "12px 14px",
              textDecoration: "none",
              transition: "border-color 0.15s, box-shadow 0.15s"
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
              width: 36, height: 36, background: a.color,
              borderRadius: 8, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 16, flexShrink: 0
            }}>
              {a.icon}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Bar chart - order trend */}
        <div style={{
          background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
          padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
                Order Trend — Last 7 Days
              </h3>
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                Total: {trend.reduce((s, d) => s + d.count, 0)} orders
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
            {trend.map((d, i) => {
              const isLast = i === trend.length - 1;
              const heightPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
              return (
                <div
                  key={d.day + i}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}
                  title={`${d.day}: ${d.count} orders — ${fmtMoney(d.revenue)}`}
                >
                  <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                    <div style={{
                      width: "100%",
                      height: `${Math.max(heightPct, 4)}%`,
                      background: isLast ? BRAND : d.count === 0 ? "#e5e7eb" : "#fca5a5",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s"
                    }} />
                  </div>
                  <span style={{
                    fontSize: 11, color: isLast ? BRAND : "#9ca3af",
                    fontWeight: isLast ? 700 : 400
                  }}>
                    {d.day}
                  </span>
                </div>
              );
            })}
          </div>
          {trend.length === 0 && (
            <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No data yet</p>
          )}
        </div>

        {/* Donut - payment methods */}
        <div style={{
          background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
          padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>
            Payment Methods
          </h3>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 12px" }}>Last 30 days</p>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <div style={{ position: "relative" }}>
              <DonutChart segments={breakdown} />
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>30d</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {breakdown.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>No payment data yet</p>
            ) : (
              breakdown.map((b, i) => (
                <div key={b.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: 2,
                      background: DONUT_COLORS[i % DONUT_COLORS.length],
                      flexShrink: 0
                    }} />
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{b.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{b.pct}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden"
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #f9fafb"
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Recent Orders</h3>
          <Link to="/orders" style={{ fontSize: 13, fontWeight: 500, color: BRAND, textDecoration: "none" }}>
            View all →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            No orders yet
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  {["Order", "Customer", "Amount", "Payment", "Shipment", "Date", ""].map((h) => (
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
                {recentOrders.map((o) => {
                  const payStyle = PAYMENT_STATUS_STYLES[String(o.paymentStatus || "pending").toLowerCase()]
                    || { background: "#f3f4f6", color: "#6b7280" };
                  const shipLabel = String(o.shipmentStatus || "pending").toLowerCase();
                  const shipStyle = SHIPMENT_STATUS_STYLES[shipLabel]
                    || { background: "#f3f4f6", color: "#6b7280" };

                  return (
                    <tr key={o.orderId} style={{ borderBottom: "1px solid #f9fafb" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#fafafa"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: BRAND, whiteSpace: "nowrap" }}>
                        {o.orderNo || o.orderId?.slice(-8) || "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ margin: 0, fontWeight: 500, color: "#1f2937" }}>{o.customerName}</p>
                        {o.customerCity && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{o.customerCity}</p>}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>
                        {fmtMoney(o.grandTotal)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <StatusPill
                          label={String(o.paymentStatus || "pending").replace(/_/g, " ")}
                          styles={payStyle}
                        />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <StatusPill
                          label={String(o.shipmentStatus || "pending").replace(/_/g, " ")}
                          styles={shipStyle}
                        />
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                        {fmtDate(o.createdAt)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <Link
                          to={`/orders/${o.orderId}`}
                          style={{ fontSize: 12, fontWeight: 500, color: BRAND, textDecoration: "none" }}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
