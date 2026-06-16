import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { fetchOrders, exportOrdersUrl } from "./orders.api";

const DEFAULT_FILTERS = { q: "", status: "", paymentStatus: "", channel: "", limit: 50 };

const STATUS_COLORS = {
  accepted: { bg: "rgba(22,163,74,0.08)", color: "#16a34a", dot: "#16a34a" },
  rejected: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", dot: "#dc2626" },
  pending: { bg: "rgba(234,179,8,0.10)", color: "#92400e", dot: "#d97706" },
  paid: { bg: "rgba(22,163,74,0.08)", color: "#16a34a", dot: "#16a34a" },
  failed: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", dot: "#dc2626" },
  processing: { bg: "rgba(37,99,235,0.08)", color: "#1d4ed8", dot: "#2563eb" },
  fulfilled: { bg: "rgba(22,163,74,0.08)", color: "#16a34a", dot: "#16a34a" },
  delivered: { bg: "rgba(22,163,74,0.08)", color: "#16a34a", dot: "#16a34a" },
  cancelled: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", dot: "#dc2626" },
  default: { bg: "rgba(100,116,139,0.08)", color: "#475569", dot: "#94a3b8" }
};

function DotBadge({ value, label }) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "_");
  const style = STATUS_COLORS[key] || STATUS_COLORS.default;
  const text = label || String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, color: style.color,
      background: style.bg, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap"
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: style.dot, flexShrink: 0 }} />
      {text}
    </span>
  );
}

function humanize(v) {
  return String(v || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
}

export function OrdersPage() {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canView = hasPermission(session, "orders.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});

  const loadOrders = async (f = filters) => {
    setError("");
    try {
      const data = await fetchOrders(f);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary(data?.summary || {});
    } catch (e) {
      setError(e.message || "Failed to load orders.");
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    await loadOrders(DEFAULT_FILTERS);
    setLoading(false);
  };

  useEffect(() => { bootstrap(); }, []);

  const onSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    await loadOrders(filters);
    setLoading(false);
  };

  const onReset = async () => {
    setFilters(DEFAULT_FILTERS);
    setLoading(true);
    await loadOrders(DEFAULT_FILTERS);
    setLoading(false);
  };

  if (!canView) return <ErrorBlock message="You do not have permission to view orders." />;

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Orders</h1>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "3px 0 0" }}>
            {summary.totalCount ?? 0} orders · {summary.unpaidCount ?? 0} unpaid
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href={exportOrdersUrl(filters)}
            download
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "1.5px solid var(--border)", background: "var(--surface)",
              color: "var(--text)", textDecoration: "none", cursor: "pointer"
            }}
          >
            Export Orders
          </a>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate("/walk-in-orders")}
          >
            + Add Order
          </button>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={onSearch} style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "14px 16px", marginBottom: 18,
        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end"
      }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
            Order ID / Customer Name, Email, Phone
          </label>
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search ID, name, email, phone, SKU..."
            style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Approval Status</label>
          <select
            value={filters.paymentStatus}
            onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))}
            style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)" }}
          >
            <option value="">Select Status</option>
            <option value="paid">Accepted</option>
            <option value="pending">Pending</option>
            <option value="failed">Rejected</option>
          </select>
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Order Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)" }}
          >
            <option value="">Select Status</option>
            <option value="order_placed">Order Placed</option>
            <option value="processing">Processing</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onReset} style={{
            padding: "7px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
            border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--muted)", cursor: "pointer"
          }}>Reset</button>
          <button type="submit" className="btn btn-primary" style={{ padding: "7px 18px" }}>Search</button>
        </div>
      </form>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 14 }}>{error}</p>}

      {loading ? (
        <LoadingBlock label="Loading orders..." />
      ) : rows.length === 0 ? (
        <EmptyBlock title="No orders found." description="Try adjusting your filters or add your first order." />
      ) : (
        <>
          {/* Desktop table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }} className="desktop-only">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)", borderBottom: "1.5px solid var(--border)" }}>
                  {["Order No", "Order Date", "Customer Name", "Accepted / Rejected", "Order Status", "Payment Method", "Payment Status", "Action"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}
                    onClick={() => navigate(`/orders/${row.id}`)}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--brand)" }}>
                      #{row.orderNo || row.id.slice(-8)}
                    </td>
                    <td style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 12 }}>
                      {formatDateTime(row.orderDate)}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: 600 }}>{row.customerName}</div>
                      {row.customerEmail && <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.customerEmail}</div>}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <DotBadge value={row.acceptanceStatus} label={humanize(row.acceptanceStatus)} />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <DotBadge value={row.orderStatus} label={humanize(row.orderStatus)} />
                    </td>
                    <td style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 12 }}>
                      {humanize(row.paymentMethod)}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <DotBadge value={row.paymentStatus} label={humanize(row.paymentStatus)} />
                    </td>
                    <td style={{ padding: "12px 14px" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => navigate(`/orders/${row.id}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mobile-cards">
            {rows.map((row) => (
              <div key={row.id}
                onClick={() => navigate(`/orders/${row.id}`)}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px", marginBottom: 10, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <strong style={{ color: "var(--brand)" }}>#{row.orderNo || row.id.slice(-8)}</strong>
                  <DotBadge value={row.orderStatus} label={humanize(row.orderStatus)} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{row.customerName}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{formatDateTime(row.orderDate)}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <DotBadge value={row.acceptanceStatus} label={humanize(row.acceptanceStatus)} />
                  <DotBadge value={row.paymentStatus} label={humanize(row.paymentStatus)} />
                </div>
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  {formatCurrencyInr(row.orderTotal)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
