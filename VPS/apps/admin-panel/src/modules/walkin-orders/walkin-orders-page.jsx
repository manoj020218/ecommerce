import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { hasPermission } from "../../shared/utils/permissions";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import {
  fetchWalkInOrders,
  confirmWalkInPayment,
  generateWalkInInvoice,
  updateWalkInOrderStatus,
  sendWalkInPaymentRequest,
  previewWalkInInvoice
} from "./walkin-orders.api";

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  walkin_order_created: { bg: "rgba(14,165,233,0.08)", color: "#0369a1", border: "rgba(14,165,233,0.3)" },
  payment_pending:      { bg: "rgba(234,179,8,0.10)", color: "#92400e", border: "rgba(234,179,8,0.35)" },
  paid:                 { bg: "rgba(22,163,74,0.10)",  color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  invoice_generated:    { bg: "rgba(37,99,235,0.08)",  color: "#1d4ed8", border: "rgba(37,99,235,0.25)" },
  ready_for_pickup:     { bg: "rgba(124,58,237,0.08)", color: "#7c3aed", border: "rgba(124,58,237,0.25)" },
  dispatched:           { bg: "rgba(124,58,237,0.08)", color: "#7c3aed", border: "rgba(124,58,237,0.25)" },
  completed:            { bg: "rgba(22,163,74,0.10)",  color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  cancelled:            { bg: "rgba(220,38,38,0.08)",  color: "#dc2626", border: "rgba(220,38,38,0.25)" },
  pending:              { bg: "rgba(234,179,8,0.10)",  color: "#92400e", border: "rgba(234,179,8,0.35)" }
};

function StatusPill({ value }) {
  const key = String(value || "").toLowerCase().replace(/ /g, "_");
  const s = STATUS_STYLES[key] || { bg: "rgba(100,116,139,0.08)", color: "#475569", border: "rgba(100,116,139,0.2)" };
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600, padding: "3px 8px",
      borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap"
    }}>
      {String(value || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

// ── Confirm Payment modal ─────────────────────────────────────────────────────

function ConfirmPaymentModal({ order, onClose, onConfirm, saving, error }) {
  const [ref, setRef] = useState(order.paymentReference || "");
  const [genInvoice, setGenInvoice] = useState(true);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: "24px 28px", width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Confirm Payment</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--muted)" }}>
          {order.orderNo} · {formatCurrencyInr(order.grandTotal)}
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Payment Reference / Note</span>
          <input value={ref} onChange={e => setRef(e.target.value)}
            placeholder="UPI ref, cheque no, cash receipt..."
            autoFocus
            style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 18, cursor: "pointer" }}>
          <input type="checkbox" checked={genInvoice} onChange={e => setGenInvoice(e.target.checked)} />
          Generate invoice on confirmation
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(ref, genInvoice)} disabled={saving}>
            {saving ? "Confirming…" : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function WalkInOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuthSession();
  const canView = hasPermission(session, "orders.view");
  const canCreate = hasPermission(session, "orders.create");
  const canEdit = hasPermission(session, "orders.edit");
  const canCancel = hasPermission(session, "orders.cancel");
  const canGenerateInvoice = hasPermission(session, "invoices.generate");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [busyKey, setBusyKey] = useState("");
  const [summary, setSummary] = useState({ totalCount: 0, unpaidCount: 0, paidCount: 0, invoicePendingCount: 0 });
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmErr, setConfirmErr] = useState("");
  const [confirmSaving, setConfirmSaving] = useState(false);

  const loadOrders = async (filters = {}) => {
    const data = await fetchWalkInOrders({ q: filters.q || "", status: filters.status || "", limit: 100 });
    setSummary(data?.summary || { totalCount: 0, unpaidCount: 0, paidCount: 0, invoicePendingCount: 0 });
    setRows(Array.isArray(data?.rows) ? data.rows : []);
  };

  useEffect(() => {
    if (!canView) return;
    // Clear navigation state notice from history so it doesn't persist on refresh
    if (location.state?.notice) window.history.replaceState({}, "");
    setLoading(true);
    loadOrders().catch(e => setError(e.message || "Failed to load.")).finally(() => setLoading(false));
  }, [canView]);

  const applyFilters = async () => {
    setError("");
    try { await loadOrders({ q, status: statusFilter }); }
    catch (e) { setError(e.message || "Failed to filter."); }
  };

  const handleConfirmPayment = async (ref, genInvoice) => {
    setConfirmSaving(true);
    setConfirmErr("");
    try {
      const data = await confirmWalkInPayment(confirmModal.id, { paymentReference: ref, generateInvoice: genInvoice });
      await loadOrders({ q, status: statusFilter });
      setConfirmModal(null);
      setNotice(data?.invoice?.invoiceNumber ? `Payment confirmed · Invoice ${data.invoice.invoiceNumber} generated.` : "Payment confirmed.");
    } catch (e) {
      setConfirmErr(e.message || "Failed to confirm payment.");
    } finally {
      setConfirmSaving(false);
    }
  };

  const handleGenerateInvoice = async (order) => {
    const key = `invoice:${order.id}`;
    setBusyKey(key); setError(""); setNotice("");
    try {
      const data = await generateWalkInInvoice(order.id, {});
      await loadOrders({ q, status: statusFilter });
      setNotice(`Invoice generated: ${data?.invoice?.invoiceNumber || order.orderNo}`);
    } catch (e) { setError(e.message || "Failed to generate invoice."); }
    finally { setBusyKey(""); }
  };

  const handleSendPaymentRequest = async (order) => {
    const key = `send-request:${order.id}`;
    setBusyKey(key); setError(""); setNotice("");
    try {
      const data = await sendWalkInPaymentRequest(order.id);
      const parts = [];
      if (data?.emailResult?.status && data.emailResult.status !== "failed") parts.push("email");
      if (data?.whatsappResult?.status && data.whatsappResult.status !== "failed") parts.push("WhatsApp");
      setNotice(
        parts.length > 0
          ? `Payment request sent via ${parts.join(" & ")} for ${order.orderNo}.`
          : `Payment request processed for ${order.orderNo}, but delivery may have failed — check email/WhatsApp settings.`
      );
    } catch (e) { setError(e.message || "Failed to send payment request."); }
    finally { setBusyKey(""); }
  };

  const handlePreviewInvoice = async (order) => {
    // Open the tab synchronously, in direct response to the click, then fill
    // it in once the (async) fetch resolves -- opening it only after the
    // await would get blocked as a non-user-gesture popup in most browsers.
    const win = window.open("", "_blank");
    if (!win) {
      setError("Pop-up blocked. Please allow pop-ups for this site to preview the invoice.");
      return;
    }
    win.document.write("<p style=\"font-family:sans-serif;padding:24px;color:#6b7280;\">Loading invoice preview…</p>");
    const key = `preview:${order.id}`;
    setBusyKey(key); setError("");
    try {
      const data = await previewWalkInInvoice(order.id);
      win.document.open();
      win.document.write(data.content);
      win.document.close();
    } catch (e) {
      win.close();
      setError(e.message || "Failed to load invoice preview.");
    } finally {
      setBusyKey("");
    }
  };

  const handleUpdateStatus = async (order, newStatus) => {
    const key = `${newStatus}:${order.id}`;
    setBusyKey(key); setError(""); setNotice("");
    try {
      await updateWalkInOrderStatus(order.id, { orderStatus: newStatus, adminNote: "" });
      await loadOrders({ q, status: statusFilter });
      setNotice(`${order.orderNo} → ${newStatus.replace(/_/g, " ")}`);
    } catch (e) { setError(e.message || "Failed to update."); }
    finally { setBusyKey(""); }
  };

  if (!canView) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
      You do not have permission to view walk-in orders.
    </div>
  );

  const STATS = [
    { label: "Total Walk-in",    value: summary.totalCount,         color: "#1d4ed8" },
    { label: "Unpaid",           value: summary.unpaidCount,        color: "#92400e" },
    { label: "Paid",             value: summary.paidCount,          color: "#16a34a" },
    { label: "Invoice Pending",  value: summary.invoicePendingCount, color: "#7c3aed" }
  ];

  return (
    <div style={{ padding: "24px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Walk-in Orders</h1>
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => navigate("/walk-in-orders/add")}>
            + New Walk-in Order
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{loading ? "—" : s.value}</div>
          </div>
        ))}
      </div>

      {/* Notice / Error */}
      {notice && (
        <div style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 13, color: "#16a34a", display: "flex", justifyContent: "space-between" }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontSize: 16 }}>×</button>
        </div>
      )}
      {error && (
        <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 13, color: "#dc2626" }}>{error}</div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && applyFilters()}
            placeholder="Search order no, customer, mobile..."
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", minWidth: 160 }}>
          <option value="">All statuses</option>
          <option value="walkin_order_created">Created</option>
          <option value="payment_pending">Payment Pending</option>
          <option value="paid">Paid</option>
          <option value="invoice_generated">Invoice Generated</option>
          <option value="ready_for_pickup">Ready for Pickup</option>
          <option value="dispatched">Dispatched</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="button" className="btn btn-secondary" onClick={applyFilters}>Filter</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "var(--muted)", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14 }}>
          No walk-in orders found.{" "}
          {canCreate && (
            <span style={{ cursor: "pointer", color: "var(--brand)", fontWeight: 600 }} onClick={() => navigate("/walk-in-orders/add")}>
              Create one →
            </span>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                {["Order", "Customer", "Amount", "Status", "Date", "Actions"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: i >= 2 && i <= 4 ? "left" : i === 5 ? "right" : "left", fontWeight: 700, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((order, idx) => (
                <tr key={order.id} style={{ borderBottom: idx < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 700, color: "var(--brand)", fontFamily: "monospace", fontSize: 13 }}>{order.orderNo}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {(order.paymentMethod || "").replace(/_/g, " ")}
                    </div>
                    {order.invoiceNumber && (
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{order.invoiceNumber}</div>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{order.companyName || order.customerName || "—"}</div>
                    {order.customerMobile && <div style={{ fontSize: 11, color: "var(--muted)" }}>{order.customerMobile}</div>}
                  </td>
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 700 }}>{formatCurrencyInr(order.grandTotal)}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>GST {formatCurrencyInr(order.gstTotal)}</div>
                    {order.shippingCharge > 0 && (
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>+Ship {formatCurrencyInr(order.shippingCharge)}</div>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                      <StatusPill value={order.orderStatus} />
                      <StatusPill value={order.paymentStatus} />
                      {order.paymentStatus !== "paid" && order.orderStatus !== "cancelled" && (
                        <button type="button"
                          onClick={() => handlePreviewInvoice(order)}
                          disabled={busyKey === `preview:${order.id}`}
                          style={{ background: "none", border: "none", padding: 0, marginTop: 2, fontSize: 11, color: "var(--brand)", cursor: "pointer", textDecoration: "underline" }}>
                          {busyKey === `preview:${order.id}` ? "Loading…" : "View Proforma"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {canEdit && order.paymentStatus !== "paid" && order.orderStatus !== "cancelled" && (
                        <button type="button" className="btn btn-secondary btn-small"
                          onClick={() => navigate(`/walk-in-orders/${order.id}/edit`)}
                          disabled={!!busyKey}>
                          Edit
                        </button>
                      )}
                      {canEdit && order.paymentStatus !== "paid" && !["completed", "cancelled"].includes(order.orderStatus) && (
                        <button type="button" className="btn btn-secondary btn-small"
                          onClick={() => handleSendPaymentRequest(order)}
                          disabled={!!busyKey}>
                          {busyKey === `send-request:${order.id}` ? "Sending…" : "Send for Payment"}
                        </button>
                      )}
                      {canEdit && order.paymentStatus !== "paid" && (
                        <button type="button" className="btn btn-primary btn-small"
                          onClick={() => { setConfirmErr(""); setConfirmModal(order); }}
                          disabled={!!busyKey}>
                          Confirm Payment
                        </button>
                      )}
                      {canGenerateInvoice && order.paymentStatus === "paid" && !order.invoiceId && (
                        <button type="button" className="btn btn-secondary btn-small"
                          onClick={() => handleGenerateInvoice(order)}
                          disabled={busyKey === `invoice:${order.id}`}>
                          {busyKey === `invoice:${order.id}` ? "Working…" : "Generate Invoice"}
                        </button>
                      )}
                      {canEdit && order.paymentStatus === "paid" && order.invoiceId &&
                        order.shippingMethod === "self_pickup" &&
                        !["ready_for_pickup", "completed", "cancelled"].includes(order.orderStatus) && (
                        <button type="button" className="btn btn-secondary btn-small"
                          onClick={() => handleUpdateStatus(order, "ready_for_pickup")}
                          disabled={!!busyKey}>
                          Ready for Pickup
                        </button>
                      )}
                      {canEdit && order.paymentStatus === "paid" && order.invoiceId &&
                        order.shippingMethod !== "self_pickup" &&
                        !["dispatched", "completed", "cancelled"].includes(order.orderStatus) && (
                        <button type="button" className="btn btn-secondary btn-small"
                          onClick={() => handleUpdateStatus(order, "dispatched")}
                          disabled={!!busyKey}>
                          Mark Dispatched
                        </button>
                      )}
                      {canEdit && order.paymentStatus === "paid" && order.invoiceId &&
                        !["completed", "cancelled"].includes(order.orderStatus) && (
                        <button type="button" className="btn btn-secondary btn-small"
                          onClick={() => handleUpdateStatus(order, "completed")}
                          disabled={!!busyKey}
                          style={{ color: "#16a34a", borderColor: "rgba(22,163,74,0.3)" }}>
                          Complete
                        </button>
                      )}
                      {canCancel && !["completed", "cancelled"].includes(order.orderStatus) && (
                        <button type="button" className="btn btn-secondary btn-small"
                          onClick={() => handleUpdateStatus(order, "cancelled")}
                          disabled={!!busyKey}
                          style={{ color: "var(--danger)", borderColor: "rgba(220,38,38,0.25)" }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmModal && (
        <ConfirmPaymentModal
          order={confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirm={handleConfirmPayment}
          saving={confirmSaving}
          error={confirmErr}
        />
      )}
    </div>
  );
}
