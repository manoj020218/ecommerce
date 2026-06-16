import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { hasPermission } from "../../shared/utils/permissions";
import { formatCurrencyInr } from "../../shared/utils/formatters";
import { fetchOrders, exportOrdersUrl } from "./orders.api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = d.getDate();
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${day} ${mon}`, time: `${hh}:${mm}` };
}

const MANUAL_METHODS = new Set(["bank_transfer", "upi_manual", "cheque", "neft", "rtgs", "manual"]);

function isVerifyPending(row) {
  const method = String(row.paymentMethod || "").toLowerCase().replace(/[\s-]/g, "_");
  return (
    MANUAL_METHODS.has(method) &&
    String(row.acceptanceStatus || "").toLowerCase() === "pending" &&
    !["cancelled", "fulfilled", "delivered"].includes(String(row.orderStatus || "").toLowerCase())
  );
}

// ── Badge: Payment ────────────────────────────────────────────────────────────

const PAY_BADGE = {
  accepted: { bg: "rgba(22,163,74,0.09)", color: "#15803d", dot: "#16a34a", label: "Paid" },
  pending:  { bg: "rgba(245,158,11,0.10)", color: "#92400e", dot: "#f59e0b", label: "Verify Pending" },
  rejected: { bg: "rgba(239,68,68,0.09)", color: "#b91c1c", dot: "#ef4444", label: "Failed" },
};

function PayBadge({ row }) {
  const key = String(row.acceptanceStatus || "pending").toLowerCase();
  const s = PAY_BADGE[key] || { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af", label: key };
  const label = isVerifyPending(row) ? "Verify Pending" : s.label;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
      whiteSpace: "nowrap"
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ── Badge: Shipment ───────────────────────────────────────────────────────────

function shipmentLabel(row) {
  const status = String(row.orderStatus || "").toLowerCase();
  const ship = String(row.shipmentStatus || "").toLowerCase();
  if (status === "cancelled") return { label: "Cancelled", bg: "#fee2e2", color: "#b91c1c" };
  if (status === "delivered" || ship === "delivered") return { label: "Delivered", bg: "rgba(22,163,74,0.09)", color: "#15803d" };
  if (status === "fulfilled" || ship === "shipped" || row.trackingId) return { label: "Shipped", bg: "rgba(147,51,234,0.09)", color: "#7e22ce" };
  if (status === "processing") return { label: "Packing", bg: "rgba(37,99,235,0.09)", color: "#1d4ed8" };
  if (["order_placed", "pending"].includes(status)) return { label: "Awaiting", bg: "#f3f4f6", color: "#6b7280" };
  return { label: "—", bg: "#f3f4f6", color: "#9ca3af" };
}

function ShipBadge({ row }) {
  const { label, bg, color } = shipmentLabel(row);
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600,
      background: bg, color, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap"
    }}>{label}</span>
  );
}

// ── Status tabs ───────────────────────────────────────────────────────────────

const TABS = [
  { key: "all",      label: "All Orders",      filter: () => true },
  { key: "new",      label: "New",             filter: r => r.orderStatus === "order_placed" },
  { key: "pending",  label: "Payment Pending", filter: r => r.acceptanceStatus === "pending" },
  { key: "processing",label: "Processing",     filter: r => r.orderStatus === "processing" },
  { key: "shipped",  label: "Shipped",         filter: r => r.orderStatus === "fulfilled" },
  { key: "delivered",label: "Delivered",       filter: r => r.orderStatus === "delivered" },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function OrdersPage() {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canView = hasPermission(session, "orders.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allRows, setAllRows] = useState([]);

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [page, setPage] = useState(1);

  const load = async () => {
    setError("");
    try {
      const data = await fetchOrders({ limit: 2000 });
      setAllRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setError(e.message || "Failed to load orders.");
    }
  };

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = {};
    TABS.forEach(t => { counts[t.key] = allRows.filter(t.filter).length; });
    return counts;
  }, [allRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const tabFn = TABS.find(t => t.key === activeTab)?.filter || (() => true);
    const q = search.trim().toLowerCase();
    return allRows.filter(row => {
      if (!tabFn(row)) return false;
      if (q) {
        const hay = [row.orderNo, row.customerName, row.customerMobile, row.customerEmail, row.companyName]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dateFilter) {
        const rowDay = (row.orderDate || "").slice(0, 10);
        if (rowDay !== dateFilter) return false;
      }
      if (payFilter) {
        if (payFilter === "paid" && row.acceptanceStatus !== "accepted") return false;
        if (payFilter === "pending" && row.acceptanceStatus !== "pending") return false;
        if (payFilter === "failed" && row.acceptanceStatus !== "rejected") return false;
      }
      return true;
    });
  }, [allRows, activeTab, search, dateFilter, payFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const onTabChange = (key) => { setActiveTab(key); setPage(1); };
  const onSearch = (e) => { setSearch(e.target.value); setPage(1); };
  const onDate = (e) => { setDateFilter(e.target.value); setPage(1); };
  const onPay = (e) => { setPayFilter(e.target.value); setPage(1); };

  if (!canView) return <ErrorBlock message="You do not have permission to view orders." />;
  if (loading) return <LoadingBlock label="Loading orders…" />;
  if (error && !allRows.length) return <ErrorBlock message={error} onRetry={load} />;

  return (
    <div style={{ padding: "20px 24px", minHeight: "100vh", background: "#f3f4f6" }}>

      {/* Page title */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>Orders</h1>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0" }}>Manage all customer orders</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={() => navigate("/walk-in-orders")}
        >
          + Add Order
        </button>
      </div>

      {/* ── Status Tabs ── */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          const count = tabCounts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              style={{
                flexShrink: 0,
                fontSize: 12, fontWeight: 600,
                padding: "7px 16px", borderRadius: 99, cursor: "pointer",
                border: active ? "none" : "1px solid #e5e7eb",
                background: active ? "#E8231A" : "#fff",
                color: active ? "#fff" : "#6b7280",
                transition: "all 0.15s"
              }}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Filter Bar ── */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
        padding: "12px 14px", marginBottom: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center"
      }}>
        {/* Search */}
        <div style={{ flex: "1 1 260px", position: "relative" }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}
            width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={onSearch}
            placeholder="Search by order #, customer name, phone…"
            style={{
              width: "100%", paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
              fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 12,
              outline: "none", boxSizing: "border-box"
            }}
          />
        </div>
        {/* Date */}
        <input
          type="date"
          value={dateFilter}
          onChange={onDate}
          style={{ fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 12, padding: "9px 12px", outline: "none" }}
        />
        {/* Payment status */}
        <select
          value={payFilter}
          onChange={onPay}
          style={{ fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 12, padding: "9px 12px", background: "#fff", outline: "none" }}
        >
          <option value="">All Payment Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Verify Pending</option>
          <option value="failed">Failed</option>
        </select>
        {/* Export CSV */}
        <a
          href={exportOrdersUrl()}
          download
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "#1f2937", color: "#fff",
            fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 12,
            textDecoration: "none", flexShrink: 0, transition: "background 0.15s"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#374151"}
          onMouseLeave={e => e.currentTarget.style.background = "#1f2937"}
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </a>
      </div>

      {error && (
        <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {/* ── Desktop Table ── */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden"
      }} className="desktop-only">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
              {["Order #", "Customer", "Items", "Amount", "Payment", "Shipment", "Date", ""].map(h => (
                <th key={h} style={{
                  padding: "11px 14px", textAlign: "left",
                  fontSize: 11, fontWeight: 700, color: "#9ca3af",
                  textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap"
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  No orders match your filter.
                </td>
              </tr>
            )}
            {pageRows.map(row => {
              const pending = isVerifyPending(row);
              const dt = fmtDate(row.orderDate);
              const orderNo = row.orderNo ? `#${row.orderNo}` : `#${(row.id || "").slice(-8).toUpperCase()}`;

              return (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: "1px solid #f9fafb",
                    background: pending ? "rgba(245,158,11,0.04)" : "#fff",
                    transition: "background 0.12s", cursor: "pointer"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = pending ? "rgba(245,158,11,0.08)" : "#f9fafb"}
                  onMouseLeave={e => e.currentTarget.style.background = pending ? "rgba(245,158,11,0.04)" : "#fff"}
                  onClick={() => navigate(`/orders/${row.id}`)}
                >
                  {/* Order # */}
                  <td style={{ padding: "14px 14px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#E8231A" }}>
                      {orderNo}
                    </span>
                  </td>

                  {/* Customer */}
                  <td style={{ padding: "14px 14px" }}>
                    <p style={{ margin: 0, fontWeight: 600, color: "#111827", fontSize: 13 }}>{row.customerName || "—"}</p>
                    {row.customerMobile && (
                      <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>{row.customerMobile}</p>
                    )}
                    {row.customerCity && (
                      <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>{row.customerCity}</p>
                    )}
                  </td>

                  {/* Items */}
                  <td style={{ padding: "14px 14px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
                    {row.itemCount ?? "—"} {row.itemCount === 1 ? "item" : "items"}
                  </td>

                  {/* Amount */}
                  <td style={{ padding: "14px 14px" }}>
                    <span style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>
                      {formatCurrencyInr(row.orderTotal)}
                    </span>
                  </td>

                  {/* Payment */}
                  <td style={{ padding: "14px 14px" }}>
                    <PayBadge row={row} />
                  </td>

                  {/* Shipment */}
                  <td style={{ padding: "14px 14px" }}>
                    <ShipBadge row={row} />
                  </td>

                  {/* Date */}
                  <td style={{ padding: "14px 14px" }}>
                    {dt && typeof dt === "object" ? (
                      <>
                        <span style={{ fontSize: 12, color: "#6b7280", display: "block" }}>{dt.date}</span>
                        <span style={{ fontSize: 11, color: "#9ca3af", display: "block" }}>{dt.time}</span>
                      </>
                    ) : <span style={{ color: "#9ca3af" }}>—</span>}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "14px 14px" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${row.id}`)}
                        style={{
                          background: "#E8231A", color: "#fff",
                          fontSize: 11, fontWeight: 600, padding: "5px 12px",
                          borderRadius: 8, border: "none", cursor: "pointer",
                          transition: "background 0.12s"
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#c41d15"}
                        onMouseLeave={e => e.currentTarget.style.background = "#E8231A"}
                      >
                        View
                      </button>

                      {/* Contextual second button */}
                      {pending && (
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${row.id}`)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "5px 12px",
                            borderRadius: 8, border: "1.5px solid #fcd34d",
                            background: "transparent", color: "#92400e", cursor: "pointer"
                          }}
                        >
                          Verify
                        </button>
                      )}
                      {!pending && row.orderStatus === "processing" && !row.trackingId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${row.id}`)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "5px 12px",
                            borderRadius: 8, border: "1.5px solid #e5e7eb",
                            background: "transparent", color: "#374151", cursor: "pointer"
                          }}
                        >
                          Ship
                        </button>
                      )}
                      {!pending && row.invoiceId && row.orderStatus !== "order_placed" && (
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${row.id}`)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "5px 12px",
                            borderRadius: 8, border: "1.5px solid #e5e7eb",
                            background: "transparent", color: "#374151", cursor: "pointer"
                          }}
                        >
                          Invoice
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderTop: "1px solid #f3f4f6"
        }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            Showing {filteredRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} orders
          </p>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</PagBtn>
            {pagRange(page, totalPages).map((p, i) =>
              p === "…"
                ? <span key={`dot${i}`} style={{ padding: "0 4px", color: "#9ca3af", fontSize: 12 }}>…</span>
                : <PagBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PagBtn>
            )}
            <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</PagBtn>
          </div>
        </div>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="mobile-cards" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pageRows.map(row => {
          const pending = isVerifyPending(row);
          const dt = fmtDate(row.orderDate);
          const orderNo = row.orderNo ? `#${row.orderNo}` : `#${(row.id || "").slice(-8).toUpperCase()}`;
          return (
            <div
              key={row.id}
              style={{
                background: pending ? "rgba(245,158,11,0.04)" : "#fff",
                borderRadius: 16, border: `1px solid ${pending ? "#fcd34d" : "#f3f4f6"}`,
                padding: 16
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#E8231A" }}>{orderNo}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 700, color: "#111827" }}>{row.customerName}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>
                    {[row.customerCity, dt && typeof dt === "object" ? `${dt.date} ${dt.time}` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#E8231A" }}>{formatCurrencyInr(row.orderTotal)}</p>
                  <div style={{ marginTop: 4 }}><PayBadge row={row} /></div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${row.id}`)}
                  style={{
                    flex: 1, background: "#E8231A", color: "#fff",
                    fontSize: 12, fontWeight: 600, padding: "9px 0",
                    borderRadius: 10, border: "none", cursor: "pointer"
                  }}
                >
                  View Order
                </button>
                {pending && (
                  <button
                    type="button"
                    onClick={() => navigate(`/orders/${row.id}`)}
                    style={{
                      flex: 1, fontSize: 12, fontWeight: 600, padding: "9px 0",
                      borderRadius: 10, border: "1.5px solid #fcd34d",
                      background: "transparent", color: "#92400e", cursor: "pointer"
                    }}
                  >
                    Verify Payment
                  </button>
                )}
                {!pending && row.orderStatus === "processing" && (
                  <button
                    type="button"
                    onClick={() => navigate(`/orders/${row.id}`)}
                    style={{
                      flex: 1, fontSize: 12, fontWeight: 600, padding: "9px 0",
                      borderRadius: 10, border: "1.5px solid #e5e7eb",
                      background: "transparent", color: "#374151", cursor: "pointer"
                    }}
                  >
                    Mark Shipped
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {pageRows.length === 0 && (
          <p style={{ textAlign: "center", color: "#9ca3af", padding: 32, fontSize: 13 }}>No orders match your filter.</p>
        )}
        {/* Mobile pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingTop: 8 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ fontSize: 13, padding: "6px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: page <= 1 ? "default" : "pointer", color: "#374151", opacity: page <= 1 ? 0.4 : 1 }}>← Prev</button>
            <span style={{ fontSize: 13, color: "#6b7280", padding: "6px 0" }}>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              style={{ fontSize: 13, padding: "6px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: page >= totalPages ? "default" : "pointer", color: "#374151", opacity: page >= totalPages ? 0.4 : 1 }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function PagBtn({ children, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 32, height: 32,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500, cursor: disabled ? "default" : "pointer",
        border: active ? "none" : "1px solid #e5e7eb",
        background: active ? "#E8231A" : "#fff",
        color: active ? "#fff" : disabled ? "#d1d5db" : "#374151",
        transition: "all 0.12s"
      }}
    >
      {children}
    </button>
  );
}

function pagRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}
