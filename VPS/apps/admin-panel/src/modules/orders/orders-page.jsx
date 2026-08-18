import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { hasPermission } from "../../shared/utils/permissions";
import { formatCurrencyInr } from "../../shared/utils/formatters";
import { fetchOrders, fetchOrderDetail, exportOrdersUrl, updateOrder, fetchStuckPaymentSessions } from "./orders.api";

const BRAND     = "#E8231A";
const BRAND_DK  = "#C41D15";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.getDate();
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const hh  = String(d.getHours()).padStart(2,"0");
  const mm  = String(d.getMinutes()).padStart(2,"0");
  return { date: `${day} ${mon}`, time: `${hh}:${mm}` };
}

function fmtDateLong(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

const MANUAL_METHODS = new Set(["bank_transfer","upi_manual","direct_bank_transfer","manual_upi","cheque","neft","rtgs","manual"]);

function isVerifyPending(row) {
  const method  = String(row.paymentMethod  || "").toLowerCase().replace(/[\s-]/g,"_");
  const accStatus = String(row.acceptanceStatus || "").toLowerCase();
  const ordStatus = String(row.orderStatus   || "").toLowerCase();
  return (
    MANUAL_METHODS.has(method) &&
    accStatus === "pending" &&
    !["cancelled","fulfilled","delivered"].includes(ordStatus)
  );
}

// ── status badges ─────────────────────────────────────────────────────────────

const PAY_BADGE = {
  accepted: { bg:"rgba(22,163,74,0.10)",  color:"#15803d", dot:"#16a34a", label:"Paid" },
  pending:  { bg:"rgba(245,158,11,0.10)", color:"#92400e", dot:"#f59e0b", label:"Verify Pending" },
  rejected: { bg:"rgba(239,68,68,0.10)",  color:"#b91c1c", dot:"#ef4444", label:"Failed" },
};

function PayBadge({ row }) {
  const key = String(row.acceptanceStatus || "pending").toLowerCase();
  const s   = PAY_BADGE[key] || PAY_BADGE.pending;
  const lbl = isVerifyPending(row) ? "Verify Pending" : s.label;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      background:s.bg, color:s.color,
      fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap"
    }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }}/>
      {lbl}
    </span>
  );
}

function shipmentLabel(row) {
  const ord  = String(row.orderStatus   || "").toLowerCase();
  const ship = String(row.shipmentStatus || "").toLowerCase();
  if (ord === "cancelled")                            return { label:"Cancelled",  bg:"rgba(239,68,68,0.10)",  color:"#b91c1c" };
  if (ord === "delivered" || ship === "delivered")    return { label:"Delivered",  bg:"rgba(22,163,74,0.10)",  color:"#15803d" };
  if (ord === "fulfilled" || ship === "shipped" || row.trackingId) return { label:"Shipped", bg:"rgba(147,51,234,0.10)", color:"#7e22ce" };
  if (ord === "processing")                           return { label:"Packing",    bg:"rgba(37,99,235,0.10)",  color:"#1d4ed8" };
  if (["order_placed","pending"].includes(ord))       return { label:"Awaiting",   bg:"#f3f4f6",               color:"#6b7280" };
  return                                                     { label:"—",          bg:"#f3f4f6",               color:"#9ca3af" };
}

function ShipBadge({ row }) {
  const { label, bg, color } = shipmentLabel(row);
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      background:bg, color, fontSize:11, fontWeight:600,
      padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap"
    }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:color, flexShrink:0, opacity:0.7 }}/>
      {label}
    </span>
  );
}

// ── tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { key:"all",        label:"All Orders",      filter: () => true },
  { key:"new",        label:"New",             filter: r => r.orderStatus === "order_placed" },
  { key:"pending",    label:"Payment Pending", filter: r => r.acceptanceStatus === "pending" },
  { key:"processing", label:"Processing",      filter: r => r.orderStatus === "processing" },
  { key:"shipped",    label:"Shipped",         filter: r => r.orderStatus === "fulfilled" },
  { key:"delivered",  label:"Delivered",       filter: r => r.orderStatus === "delivered" },
];

const PAGE_SIZE = 20;

// ── order detail side panel ───────────────────────────────────────────────────

function addrStr(a) {
  if (!a) return "";
  if (typeof a === "string") return a;
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ");
}

function SidePanelBtn({ children, variant = "default", onClick, disabled }) {
  const styles = {
    default: { background:"#f3f4f6", color:"#374151", border:"none" },
    brand:   { background:BRAND,     color:"#fff",     border:"none" },
    green:   { background:"#16a34a", color:"#fff",     border:"none" },
    outline: { background:"transparent", color:"#374151", border:"1.5px solid #e5e7eb" },
    danger:  { background:"transparent", color:"#b91c1c", border:"1.5px solid #fca5a5" },
  };
  const s = styles[variant];
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...s, width:"100%", padding:"11px 0", borderRadius:12,
      fontSize:13, fontWeight:600, cursor: disabled ? "wait" : "pointer",
      opacity: disabled ? 0.6 : 1, transition:"opacity 0.15s"
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = disabled ? "0.6" : "1"; }}
    >
      {children}
    </button>
  );
}

function OrderSidePanel({ orderId, order, loading, onClose, onNavigate, onCancelOrder }) {
  const panelRef = useRef(null);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState("");

  // close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!orderId) return null;

  const handleCancel = async () => {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    setCancelSaving(true);
    setCancelError("");
    try {
      await onCancelOrder(orderId);
    } catch (e) {
      setCancelError(e.message || "Failed to cancel order.");
    } finally {
      setCancelSaving(false);
    }
  };

  const o   = order || {};
  const pending = isVerifyPending(o);
  const orderNo = o.orderNo ? `#${o.orderNo}` : orderId ? `#${String(orderId).slice(-8).toUpperCase()}` : "—";
  const billing = o.billingAddress || o.shippingAddress || {};
  const customerName = billing.name || billing.companyName || o.companyName || o.customerName || "—";
  const phone = billing.phone || billing.mobile || o.customerMobile || "";
  const email = billing.email || o.customerEmail || "";
  const addr  = addrStr(o.shippingAddress || o.billingAddress);
  const items = Array.isArray(o.items) ? o.items : [];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex" }}>
      {/* backdrop */}
      <div
        style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)" }}
        onClick={onClose}
      />

      {/* drawer */}
      <div ref={panelRef} style={{
        position:"relative", marginLeft:"auto",
        width:"100%", maxWidth:480,
        height:"100%", overflowY:"auto",
        background:"#fff", boxShadow:"-4px 0 32px rgba(0,0,0,0.18)",
        display:"flex", flexDirection:"column"
      }}>

        {/* sticky header */}
        <div style={{
          position:"sticky", top:0, zIndex:10,
          background:"#fff", borderBottom:"1px solid #f3f4f6",
          padding:"14px 20px",
          display:"flex", alignItems:"center", justifyContent:"space-between"
        }}>
          <div>
            <p style={{ margin:0, fontFamily:"monospace", fontSize:14, fontWeight:700, color:BRAND }}>{orderNo}</p>
            <p style={{ margin:"2px 0 0", fontSize:11, color:"#9ca3af" }}>{fmtDateLong(o.orderDate || o.createdAt)}</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button type="button" onClick={onNavigate} style={{
              fontSize:12, fontWeight:600, color:BRAND, background:"transparent",
              border:`1px solid ${BRAND}`, borderRadius:8, padding:"5px 12px", cursor:"pointer"
            }}>
              Full Details →
            </button>
            <button type="button" onClick={onClose} style={{
              width:32, height:32, borderRadius:8, border:"1px solid #e5e7eb",
              background:"transparent", cursor:"pointer", display:"flex",
              alignItems:"center", justifyContent:"center", color:"#6b7280"
            }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#9ca3af", fontSize:13 }}>
            Loading order…
          </div>
        ) : (
          <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Customer */}
            <div style={{ background:"#f9fafb", borderRadius:12, padding:"14px 16px" }}>
              <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>Customer</p>
              <p style={{ margin:0, fontWeight:700, color:"#111827", fontSize:14 }}>{customerName}</p>
              {phone && <p style={{ margin:"3px 0 0", fontSize:13, color:"#6b7280" }}>{phone}</p>}
              {email && <p style={{ margin:"2px 0 0", fontSize:12, color:"#6b7280" }}>{email}</p>}
              {addr  && <p style={{ margin:"6px 0 0", fontSize:12, color:"#9ca3af", lineHeight:1.5 }}>{addr}</p>}
            </div>

            {/* Items */}
            {items.length > 0 && (
              <div>
                <p style={{ margin:"0 0 10px", fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>Order Items</p>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{
                      display:"flex", alignItems:"center", gap:12,
                      background:"#fff", border:"1px solid #f3f4f6",
                      borderRadius:12, padding:"10px 14px"
                    }}>
                      <div style={{
                        width:36, height:36, background:"#f3f4f6", borderRadius:8,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        flexShrink:0, fontSize:16
                      }}>📦</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, fontSize:12, fontWeight:600, color:"#1f2937",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {item.title || item.name || "Product"} × {item.qty || item.quantity || 1}
                        </p>
                        {item.sku && <p style={{ margin:"1px 0 0", fontSize:11, color:"#9ca3af" }}>{item.sku}</p>}
                      </div>
                      <p style={{ margin:0, fontSize:13, fontWeight:700, color:"#111827", flexShrink:0 }}>
                        {formatCurrencyInr(item.totalPrice || item.lineTotal || (item.unitPrice * (item.qty || 1)))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financials */}
            <div style={{ background:"#f9fafb", borderRadius:12, padding:"14px 16px" }}>
              <p style={{ margin:"0 0 10px", fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>Summary</p>
              {[
                ["Product Total",  formatCurrencyInr(o.pricing?.productSubtotal)],
                ["GST",            formatCurrencyInr(o.pricing?.gstTotal)],
                o.pricing?.discountAmount > 0 && ["Discount", `− ${formatCurrencyInr(o.pricing.discountAmount)}`],
                ["Shipping",       o.pricing?.shippingCharge > 0 ? formatCurrencyInr(o.pricing.shippingCharge) : "FREE"],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                  <span style={{ color:"#6b7280" }}>{label}</span>
                  <span style={{ fontWeight:500, color: label === "Discount" ? "#16a34a" : "#374151" }}>{value}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", paddingTop:10, borderTop:"1px solid #e5e7eb", fontSize:15 }}>
                <span style={{ fontWeight:700, color:"#111827" }}>Grand Total</span>
                <span style={{ fontWeight:800, color:BRAND }}>{formatCurrencyInr(o.orderTotal || o.grandTotal)}</span>
              </div>
            </div>

            {/* Payment details */}
            <div style={{
              background: pending ? "rgba(245,158,11,0.07)" : "#f9fafb",
              border: pending ? "1px solid #fcd34d" : "1px solid #f3f4f6",
              borderRadius:12, padding:"14px 16px"
            }}>
              <p style={{ margin:"0 0 10px", fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>Payment</p>
              {[
                ["Method",  String(o.paymentMethod || "—").replace(/_/g," ")],
                o.utrReference && ["UTR Ref", o.utrReference],
                o.manualPaymentNote && ["Note", o.manualPaymentNote],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:13 }}>
                  <span style={{ color:"#6b7280" }}>{label}</span>
                  <span style={{ fontWeight:500, color:"#374151", fontFamily: label === "UTR Ref" ? "monospace" : "inherit", fontSize: label === "UTR Ref" ? 12 : 13 }}>{value}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                <span style={{ color:"#6b7280" }}>Status</span>
                <PayBadge row={o} />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {pending && (
                <SidePanelBtn variant="green" onClick={onNavigate}>
                  ✓ Verify Payment &amp; Confirm Order
                </SidePanelBtn>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {o.invoiceId && (
                  <SidePanelBtn variant="outline" onClick={onNavigate}>Download Invoice</SidePanelBtn>
                )}
                {o.orderStatus === "processing" && !o.trackingId && (
                  <SidePanelBtn variant="outline" onClick={onNavigate}>Add Shipment</SidePanelBtn>
                )}
              </div>
              {!["cancelled","delivered"].includes(String(o.orderStatus || "").toLowerCase()) && (
                <SidePanelBtn variant="danger" onClick={handleCancel} disabled={cancelSaving}>
                  {cancelSaving ? "Cancelling…" : "Cancel Order"}
                </SidePanelBtn>
              )}
              {cancelError && <p style={{ color:"#dc2626", fontSize:12, margin:0 }}>{cancelError}</p>}
              <SidePanelBtn variant="default" onClick={onNavigate}>View Full Details →</SidePanelBtn>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── stuck payments alert ─────────────────────────────────────────────────────

function StuckPaymentRow({ row, tone }) {
  const borderColor = tone === "danger" ? "#fee2e2" : "#f3f4f6";
  const stuckColor = tone === "danger" ? "#b91c1c" : "#9ca3af";

  return (
    <div style={{
      display:"flex", flexWrap:"wrap", alignItems:"center", gap:"4px 12px",
      background:"#fff", border:`1px solid ${borderColor}`, borderRadius:10,
      padding:"8px 12px", fontSize:12
    }}>
      <strong style={{ color:"#111827" }}>{row.customerName || "Unknown"}</strong>
      <span style={{ color:"#374151", fontWeight:700 }}>{formatCurrencyInr(row.amount)}</span>
      <span style={{ color:"#6b7280" }}>{row.customerEmail}</span>
      <span style={{ color:"#6b7280" }}>{row.customerMobile}</span>
      <span style={{ color:"#9ca3af" }}>via {row.gateway || "unknown gateway"}</span>
      {row.gatewayTxnId ? (
        <span style={{ color:"#b91c1c", fontFamily:"monospace", fontSize:11 }}>
          txn: {row.gatewayTxnId}
        </span>
      ) : row.gatewayOrderId ? (
        <span style={{ color:"#9ca3af", fontFamily:"monospace", fontSize:11 }}>{row.gatewayOrderId}</span>
      ) : null}
      <span style={{ marginLeft:"auto", color:stuckColor, fontWeight:600, whiteSpace:"nowrap" }}>
        stuck {row.stuckForMinutes != null ? `${row.stuckForMinutes}m` : "—"}
      </span>
    </div>
  );
}

// Split, not one blanket "payment received" claim: a payment attempt only
// gets a gateway txn ID once the gateway actually processed something. No
// txn ID almost always means the buyer backed out before paying anything —
// already tracked separately by the abandoned-cart recovery flow — not a
// captured payment we lost track of. Confirmed 2026-08-15 against two real
// "stuck" sessions: zero-txn-ID ones were never in Razorpay/Cashfree's
// dashboards either. Mixing both cases under one urgent-red banner made the
// alert cry wolf on every routine abandonment, which is exactly the kind of
// thing that gets ignored right when it's flagging a real one.
function StuckPaymentsAlert({ rows }) {
  if (!rows.length) return null;

  const chargeable = rows.filter((row) => row.likelyCharged);
  const abandoned = rows.filter((row) => !row.likelyCharged);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
      {chargeable.length > 0 ? (
        <div style={{
          background:"rgba(239,68,68,0.06)", border:"1px solid #fca5a5",
          borderRadius:16, padding:"14px 16px"
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:16 }}>⚠️</span>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:"#b91c1c" }}>
              Payment may have been captured — no order created ({chargeable.length})
            </p>
          </div>
          <p style={{ margin:"0 0 10px", fontSize:12, color:"#7f1d1d" }}>
            The gateway returned a transaction ID for these but no order was created — usually a
            missed/unregistered webhook. Verify the txn ID below directly in Razorpay/Cashfree's
            dashboard before reconciling manually.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {chargeable.map((row) => (
              <StuckPaymentRow key={row.checkoutSessionId} row={row} tone="danger" />
            ))}
          </div>
        </div>
      ) : null}

      {abandoned.length > 0 ? (
        <div style={{
          background:"#f9fafb", border:"1px solid #e5e7eb",
          borderRadius:16, padding:"14px 16px"
        }}>
          <p style={{ margin:"0 0 10px", fontSize:13, fontWeight:700, color:"#374151" }}>
            Checkout abandoned before payment ({abandoned.length})
          </p>
          <p style={{ margin:"0 0 10px", fontSize:12, color:"#6b7280" }}>
            No transaction ID was ever issued for these — nothing was charged. The buyer likely
            closed the tab before reaching or completing the gateway's checkout screen. Already
            tracked in the abandoned-cart recovery flow; nothing to reconcile here.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {abandoned.map((row) => (
              <StuckPaymentRow key={row.checkoutSessionId} row={row} tone="muted" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function OrdersPage() {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canView = hasPermission(session, "orders.view");

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [allRows, setAllRows]     = useState([]);
  const [stuckPayments, setStuckPayments] = useState([]);

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch]       = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [payFilter, setPayFilter]   = useState("");
  const [page, setPage]             = useState(1);

  // side panel
  const [panelId, setPanelId]         = useState(null);
  const [panelOrder, setPanelOrder]   = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);

  const load = async () => {
    setError("");
    try {
      const data = await fetchOrders({ limit: 2000 });
      setAllRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setError(e.message || "Failed to load orders.");
    }
    try {
      const stuck = await fetchStuckPaymentSessions();
      setStuckPayments(Array.isArray(stuck) ? stuck : []);
    } catch {
      // non-critical — don't block the orders list on this
    }
  };

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  // tab counts
  const tabCounts = useMemo(() => {
    const counts = {};
    TABS.forEach(t => { counts[t.key] = allRows.filter(t.filter).length; });
    return counts;
  }, [allRows]);

  // filtered rows
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
        const rowDay = (row.orderDate || row.createdAt || "").slice(0, 10);
        if (rowDay !== dateFilter) return false;
      }
      if (payFilter) {
        if (payFilter === "paid"    && row.acceptanceStatus !== "accepted") return false;
        if (payFilter === "pending" && row.acceptanceStatus !== "pending")  return false;
        if (payFilter === "failed"  && row.acceptanceStatus !== "rejected") return false;
      }
      return true;
    });
  }, [allRows, activeTab, search, dateFilter, payFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows   = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const onTabChange = (key) => { setActiveTab(key); setPage(1); };
  const onSearch    = (e)   => { setSearch(e.target.value); setPage(1); };
  const onDate      = (e)   => { setDateFilter(e.target.value); setPage(1); };
  const onPay       = (e)   => { setPayFilter(e.target.value); setPage(1); };

  const openPanel = async (row) => {
    setPanelId(row.id);
    setPanelOrder(row); // show list data immediately while loading full detail
    setPanelLoading(true);
    try {
      const data = await fetchOrderDetail(row.id);
      setPanelOrder(data);
    } catch {
      // keep list row data
    } finally {
      setPanelLoading(false);
    }
  };

  const closePanel   = () => { setPanelId(null); setPanelOrder(null); };
  const goToFullPage = () => { if (panelId) navigate(`/orders/${panelId}`); };

  const onCancelOrderFromPanel = async (orderId) => {
    const updated = await updateOrder(orderId, { orderStatus: "cancelled" });
    setPanelOrder(updated);
    setAllRows((prev) => prev.map((row) => (row.id === orderId ? { ...row, ...updated } : row)));
  };

  if (!canView) return <ErrorBlock message="You do not have permission to view orders." />;
  if (loading)  return <LoadingBlock label="Loading orders…" />;
  if (error && !allRows.length) return <ErrorBlock message={error} onRetry={load} />;

  return (
    <div style={{ padding:"20px 24px", background:"#f3f4f6", minHeight:"100vh" }}>

      {/* header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:"#111827", margin:0 }}>Orders</h1>
          <p style={{ fontSize:12, color:"#9ca3af", margin:"2px 0 0" }}>Manage all customer orders</p>
        </div>
        <button type="button" className="btn btn-primary btn-small"
          onClick={() => navigate("/walk-in-orders")}>
          + Add Order
        </button>
      </div>

      <StuckPaymentsAlert rows={stuckPayments} />

      {/* status tabs */}
      <div style={{ display:"flex", gap:8, overflowX:"auto", marginBottom:14, paddingBottom:2, scrollbarWidth:"none" }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          const count  = tabCounts[t.key] ?? 0;
          return (
            <button key={t.key} type="button" onClick={() => onTabChange(t.key)} style={{
              flexShrink:0, fontSize:12, fontWeight:600,
              padding:"7px 16px", borderRadius:99, cursor:"pointer",
              border: active ? "none" : "1px solid #e5e7eb",
              background: active ? BRAND : "#fff",
              color: active ? "#fff" : "#6b7280",
              transition:"all 0.15s"
            }}>
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* filter bar */}
      <div style={{
        background:"#fff", borderRadius:16, border:"1px solid #f3f4f6",
        padding:"12px 14px", marginBottom:14,
        boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
        display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"
      }}>
        <div style={{ flex:"1 1 240px", position:"relative" }}>
          <svg style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#9ca3af", pointerEvents:"none" }}
            width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" value={search} onChange={onSearch}
            placeholder="Search order #, customer, phone…"
            style={{ width:"100%", paddingLeft:34, paddingRight:12, paddingTop:9, paddingBottom:9,
              fontSize:13, border:"1px solid #e5e7eb", borderRadius:10, outline:"none",
              boxSizing:"border-box", transition:"border-color 0.15s" }}
            onFocus={e => { e.target.style.borderColor = BRAND; }}
            onBlur={e  => { e.target.style.borderColor = "#e5e7eb"; }}
          />
        </div>
        <input type="date" value={dateFilter} onChange={onDate}
          style={{ fontSize:13, border:"1px solid #e5e7eb", borderRadius:10, padding:"9px 12px", outline:"none",
            transition:"border-color 0.15s" }}
          onFocus={e => { e.target.style.borderColor = BRAND; }}
          onBlur={e  => { e.target.style.borderColor = "#e5e7eb"; }}
        />
        <select value={payFilter} onChange={onPay}
          style={{ fontSize:13, border:"1px solid #e5e7eb", borderRadius:10, padding:"9px 12px",
            background:"#fff", outline:"none", transition:"border-color 0.15s" }}
          onFocus={e => { e.target.style.borderColor = BRAND; }}
          onBlur={e  => { e.target.style.borderColor = "#e5e7eb"; }}
        >
          <option value="">All Payment Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Verify Pending</option>
          <option value="failed">Failed</option>
        </select>
        <a href={exportOrdersUrl()} download style={{
          display:"inline-flex", alignItems:"center", gap:7,
          background:"#1f2937", color:"#fff",
          fontSize:13, fontWeight:600, padding:"9px 16px", borderRadius:10,
          textDecoration:"none", flexShrink:0, transition:"background 0.15s"
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "#374151"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#1f2937"; }}
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Export CSV
        </a>
      </div>

      {error && <p style={{ color:"#dc2626", fontSize:13, marginBottom:12 }}>{error}</p>}

      {/* ── desktop table ── */}
      <div className="desktop-only" style={{
        background:"#fff", borderRadius:16, border:"1px solid #f3f4f6",
        boxShadow:"0 1px 4px rgba(0,0,0,0.04)", overflow:"hidden"
      }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f9fafb", borderBottom:"1px solid #f3f4f6" }}>
              <th style={{ padding:"11px 14px 11px 18px", width:36 }}>
                <input type="checkbox" style={{ accentColor:BRAND, cursor:"pointer" }}/>
              </th>
              {["Order #","Customer","Items","Amount","Payment","Shipment","Date",""].map(h => (
                <th key={h} style={{
                  padding:"11px 12px", textAlign:"left",
                  fontSize:11, fontWeight:700, color:"#9ca3af",
                  textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap"
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding:40, textAlign:"center", color:"#9ca3af", fontSize:13 }}>
                  No orders match your filter.
                </td>
              </tr>
            )}
            {pageRows.map(row => {
              const pending = isVerifyPending(row);
              const dt      = fmtDate(row.orderDate || row.createdAt);
              const orderNo = row.orderNo ? `#${row.orderNo}` : `#${String(row.id || "").slice(-8).toUpperCase()}`;
              const isOpen  = panelId === row.id;

              return (
                <tr key={row.id}
                  style={{
                    borderBottom:"1px solid #f9fafb",
                    background: isOpen    ? "rgba(232,35,26,0.04)"
                              : pending   ? "rgba(245,158,11,0.04)"
                              : "#fff",
                    cursor:"pointer", transition:"background 0.12s"
                  }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = pending ? "rgba(245,158,11,0.08)" : "#f9fafb"; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = pending ? "rgba(245,158,11,0.04)" : "#fff"; }}
                  onClick={() => openPanel(row)}
                >
                  <td style={{ padding:"14px 14px 14px 18px" }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" style={{ accentColor:BRAND, cursor:"pointer" }}/>
                  </td>
                  <td style={{ padding:"14px 12px", fontFamily:"monospace", fontSize:12, fontWeight:700, color:BRAND, whiteSpace:"nowrap" }}>
                    {orderNo}
                  </td>
                  <td style={{ padding:"14px 12px" }}>
                    <p style={{ margin:0, fontWeight:600, color:"#111827" }}>{row.customerName || "—"}</p>
                    {row.customerMobile && <p style={{ margin:"1px 0 0", fontSize:11, color:"#9ca3af" }}>{row.customerMobile}</p>}
                    {row.customerCity   && <p style={{ margin:"1px 0 0", fontSize:11, color:"#9ca3af" }}>{row.customerCity}</p>}
                  </td>
                  <td style={{ padding:"14px 12px", color:"#6b7280", fontSize:12, whiteSpace:"nowrap" }}>
                    {row.itemCount ?? "—"} {row.itemCount === 1 ? "item" : "items"}
                  </td>
                  <td style={{ padding:"14px 12px", fontWeight:700, color:"#111827", fontSize:14, whiteSpace:"nowrap" }}>
                    {formatCurrencyInr(row.orderTotal)}
                  </td>
                  <td style={{ padding:"14px 12px" }}><PayBadge row={row}/></td>
                  <td style={{ padding:"14px 12px" }}><ShipBadge row={row}/></td>
                  <td style={{ padding:"14px 12px", whiteSpace:"nowrap" }}>
                    {dt ? (
                      <>
                        <span style={{ fontSize:12, color:"#6b7280", display:"block" }}>{dt.date}</span>
                        <span style={{ fontSize:11, color:"#9ca3af", display:"block" }}>{dt.time}</span>
                      </>
                    ) : <span style={{ color:"#9ca3af" }}>—</span>}
                  </td>
                  <td style={{ padding:"14px 12px" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                      <button type="button" onClick={() => openPanel(row)} style={{
                        background:BRAND, color:"#fff",
                        fontSize:11, fontWeight:600, padding:"5px 12px",
                        borderRadius:8, border:"none", cursor:"pointer"
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = BRAND_DK; }}
                        onMouseLeave={e => { e.currentTarget.style.background = BRAND; }}
                      >View</button>

                      {pending && (
                        <button type="button" onClick={() => openPanel(row)} style={{
                          fontSize:11, fontWeight:600, padding:"5px 12px",
                          borderRadius:8, border:"1.5px solid #fcd34d",
                          background:"transparent", color:"#92400e", cursor:"pointer"
                        }}>Verify</button>
                      )}
                      {!pending && row.orderStatus === "processing" && !row.trackingId && (
                        <button type="button" onClick={() => openPanel(row)} style={{
                          fontSize:11, fontWeight:600, padding:"5px 12px",
                          borderRadius:8, border:"1.5px solid #e5e7eb",
                          background:"transparent", color:"#374151", cursor:"pointer"
                        }}>Ship</button>
                      )}
                      {!pending && row.invoiceId && (
                        <button type="button" onClick={() => openPanel(row)} style={{
                          fontSize:11, fontWeight:600, padding:"5px 12px",
                          borderRadius:8, border:"1.5px solid #e5e7eb",
                          background:"transparent", color:"#374151", cursor:"pointer"
                        }}>Invoice</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* pagination */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderTop:"1px solid #f3f4f6" }}>
          <p style={{ fontSize:12, color:"#6b7280", margin:0 }}>
            Showing {filteredRows.length === 0 ? 0 : (page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filteredRows.length)} of {filteredRows.length} orders
          </p>
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <PagBtn disabled={page<=1} onClick={() => setPage(p=>p-1)}>←</PagBtn>
            {pagRange(page, totalPages).map((p,i) =>
              p === "…"
                ? <span key={`dot${i}`} style={{ padding:"0 4px", color:"#9ca3af", fontSize:12 }}>…</span>
                : <PagBtn key={p} active={p===page} onClick={() => setPage(p)}>{p}</PagBtn>
            )}
            <PagBtn disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}>→</PagBtn>
          </div>
        </div>
      </div>

      {/* ── mobile cards ── */}
      <div className="mobile-cards" style={{ flexDirection:"column", gap:10 }}>
        {pageRows.length === 0 && (
          <p style={{ textAlign:"center", color:"#9ca3af", padding:32, fontSize:13 }}>No orders match your filter.</p>
        )}
        {pageRows.map(row => {
          const pending = isVerifyPending(row);
          const dt      = fmtDate(row.orderDate || row.createdAt);
          const orderNo = row.orderNo ? `#${row.orderNo}` : `#${String(row.id || "").slice(-8).toUpperCase()}`;
          return (
            <div key={row.id} style={{
              background: pending ? "rgba(255,251,235,0.8)" : "#fff",
              borderRadius:16, border:`1px solid ${pending ? "#fcd34d" : "#f3f4f6"}`,
              padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
                <div>
                  <p style={{ margin:0, fontFamily:"monospace", fontSize:11, fontWeight:700, color:BRAND }}>{orderNo}</p>
                  <p style={{ margin:"3px 0 0", fontSize:14, fontWeight:700, color:"#111827" }}>{row.customerName}</p>
                  <p style={{ margin:"2px 0 0", fontSize:11, color:"#9ca3af" }}>
                    {[row.customerCity, dt ? `${dt.date} ${dt.time}` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ margin:0, fontWeight:700, fontSize:16, color:BRAND }}>{formatCurrencyInr(row.orderTotal)}</p>
                  <div style={{ marginTop:4, display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end" }}>
                    <PayBadge row={row}/>
                    <ShipBadge row={row}/>
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button type="button" onClick={() => openPanel(row)} style={{
                  flex:1, background:BRAND, color:"#fff",
                  fontSize:12, fontWeight:600, padding:"9px 0",
                  borderRadius:10, border:"none", cursor:"pointer"
                }}>View Order</button>
                {pending && (
                  <button type="button" onClick={() => openPanel(row)} style={{
                    flex:1, fontSize:12, fontWeight:600, padding:"9px 0",
                    borderRadius:10, border:"1.5px solid #fcd34d",
                    background:"transparent", color:"#92400e", cursor:"pointer"
                  }}>Verify Payment</button>
                )}
                {!pending && row.orderStatus === "processing" && (
                  <button type="button" onClick={() => openPanel(row)} style={{
                    flex:1, fontSize:12, fontWeight:600, padding:"9px 0",
                    borderRadius:10, border:"1.5px solid #e5e7eb",
                    background:"transparent", color:"#374151", cursor:"pointer"
                  }}>Mark Shipped</button>
                )}
              </div>
            </div>
          );
        })}

        {totalPages > 1 && (
          <div style={{ display:"flex", justifyContent:"center", gap:8, paddingTop:8 }}>
            <button type="button" disabled={page<=1} onClick={() => setPage(p=>p-1)} style={{
              fontSize:13, padding:"6px 16px", borderRadius:8, border:"1px solid #e5e7eb",
              background:"#fff", cursor:page<=1?"default":"pointer", color:"#374151", opacity:page<=1?0.4:1
            }}>← Prev</button>
            <span style={{ fontSize:13, color:"#6b7280", padding:"6px 0" }}>Page {page} of {totalPages}</span>
            <button type="button" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} style={{
              fontSize:13, padding:"6px 16px", borderRadius:8, border:"1px solid #e5e7eb",
              background:"#fff", cursor:page>=totalPages?"default":"pointer", color:"#374151", opacity:page>=totalPages?0.4:1
            }}>Next →</button>
          </div>
        )}
      </div>

      {/* side panel */}
      <OrderSidePanel
        orderId={panelId}
        order={panelOrder}
        loading={panelLoading}
        onClose={closePanel}
        onNavigate={goToFullPage}
        onCancelOrder={onCancelOrderFromPanel}
      />
    </div>
  );
}

// ── pagination helpers ────────────────────────────────────────────────────────

function PagBtn({ children, active, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{
      width:32, height:32,
      display:"flex", alignItems:"center", justifyContent:"center",
      borderRadius:8, fontSize:12, fontWeight: active ? 700 : 500,
      cursor: disabled ? "default" : "pointer",
      border: active ? "none" : "1px solid #e5e7eb",
      background: active ? BRAND : "#fff",
      color: active ? "#fff" : disabled ? "#d1d5db" : "#374151",
      transition:"all 0.12s"
    }}>
      {children}
    </button>
  );
}

function pagRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1,2,3,4,5,"…",total];
  if (current >= total-3) return [1,"…",total-4,total-3,total-2,total-1,total];
  return [1,"…",current-1,current,current+1,"…",total];
}
