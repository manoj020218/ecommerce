import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { hasPermission } from "../../shared/utils/permissions";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import {
  fetchOrderDetail,
  updateOrder,
  generateInvoiceForOrder,
  fetchInvoiceForOrder,
  fetchInvoiceDownloadData,
  fetchShippingCouriers,
  createShipment,
  updateShipmentTracking,
  uploadShipmentPod,
  sendTrackingEmail
} from "./orders.api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanize(v) {
  return String(v || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
}

function formatAddress(addr) {
  if (!addr || typeof addr !== "object") return "—";
  return [addr.companyName, addr.name, addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.pincode]
    .filter(Boolean).join(", ") || "—";
}

function buildWaLink(phone, message) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// ── Status chip ───────────────────────────────────────────────────────────────

const CHIP_COLORS = {
  accepted: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  paid: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  fulfilled: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  delivered: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  processing: { bg: "rgba(37,99,235,0.08)", color: "#1d4ed8", border: "rgba(37,99,235,0.25)" },
  pending: { bg: "rgba(234,179,8,0.1)", color: "#92400e", border: "rgba(234,179,8,0.35)" },
  failed: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", border: "rgba(220,38,38,0.25)" },
  rejected: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", border: "rgba(220,38,38,0.25)" },
  cancelled: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", border: "rgba(220,38,38,0.25)" },
  order_placed: { bg: "rgba(14,165,233,0.08)", color: "#0369a1", border: "rgba(14,165,233,0.25)" },
};

function StatusChip({ label, value }) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "_");
  const style = CHIP_COLORS[key] || { bg: "rgba(100,116,139,0.08)", color: "#475569", border: "rgba(100,116,139,0.2)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 700, color: style.color,
        background: style.bg, border: `1px solid ${style.border}`,
        borderRadius: 20, padding: "3px 10px", display: "inline-block"
      }}>
        {humanize(value)}
      </span>
    </div>
  );
}

// ── Mark as Processing modal ─────────────────────────────────────────────────

function ProcessingModal({ order, onClose, onSave, saving, error }) {
  const [items, setItems] = useState(() =>
    (order.items || []).map((item, i) => ({
      srNo: i + 1,
      productId: item.productId,
      title: item.title,
      fulfillQty: item.qty
    }))
  );
  const [note, setNote] = useState(order.adminNote || "");

  const updateItem = (idx, key, val) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));

  return (
    <Modal title="Mark as Processing" open onClose={onClose} width="620px">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          Review items below. Adjust fulfill quantity if dispatching a partial shipment due to stock shortage.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)", width: 50 }}>Sr#</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Product</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)", width: 80 }}>Ordered</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)", width: 100 }}>Fulfill Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "10px 12px", color: "var(--muted)", fontWeight: 600 }}>
                    <input
                      type="number" min="1" value={item.srNo}
                      onChange={(e) => updateItem(idx, "srNo", Number(e.target.value))}
                      style={{ width: 40, padding: "4px 6px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 5, textAlign: "center" }}
                    />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>ID: {item.productId}</div>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--muted)" }}>
                    {(order.items || []).find((o) => o.productId === item.productId)?.qty ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <input
                      type="number" min="0" value={item.fulfillQty}
                      onChange={(e) => updateItem(idx, "fulfillQty", Number(e.target.value))}
                      style={{ width: 70, padding: "5px 8px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 5, textAlign: "center" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Admin Note (internal)</span>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)}
            rows={2} placeholder="Internal notes about this processing step..."
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary" disabled={saving}
            onClick={() => onSave({ fulfillmentItems: items, adminNote: note })}
          >
            {saving ? "Saving…" : "Mark as Processing"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Convert to Fulfill modal ──────────────────────────────────────────────────

function FulfillModal({ order, invoice, couriers, onClose, onSave, saving, error }) {
  const [form, setForm] = useState({
    courierProfileId: "",
    trackingId: "",
    dispatchDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: "",
    customerNote: order.customerNote || "",
    podFile: null
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const customerMobile = order.billingAddress?.mobile || order.shippingAddress?.mobile || order.customerMobile || "";

  return (
    <Modal title="Convert to Fulfill — Dispatch Order" open onClose={onClose} width="580px">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#1d4ed8", fontWeight: 500 }}>
            Invoice #{invoice?.invoiceNumber} · {order.itemCount} item(s) · {formatCurrencyInr(order.orderTotal)}
          </p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Courier Partner</span>
          <select value={form.courierProfileId} onChange={(e) => set("courierProfileId", e.target.value)}
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)" }}>
            <option value="">Select courier...</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>{c.courierName}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Tracking Number / AWB</span>
          <input value={form.trackingId} onChange={(e) => set("trackingId", e.target.value)}
            placeholder="Enter tracking / AWB number"
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Dispatch Date</span>
            <input type="date" value={form.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Expected Delivery</span>
            <input type="date" value={form.expectedDeliveryDate} onChange={(e) => set("expectedDeliveryDate", e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
          </label>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            Customer Note <span style={{ fontWeight: 400, color: "var(--muted)" }}>(sent via WhatsApp & email)</span>
          </span>
          <textarea value={form.customerNote} onChange={(e) => set("customerNote", e.target.value)}
            rows={2} placeholder="Message to send to customer with dispatch notification..."
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            Package Image <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
          </span>
          <input type="file" accept="image/*,application/pdf"
            onChange={(e) => set("podFile", e.target.files?.[0] || null)}
            style={{ fontSize: 13 }} />
        </label>

        {customerMobile && form.trackingId && (
          <div style={{ background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.3)", borderRadius: 8, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#166534" }}>
              After dispatch, a WhatsApp message will open for {order.customerName} ({customerMobile}) with tracking info.
            </p>
          </div>
        )}

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary" disabled={saving || !form.trackingId}
            onClick={() => onSave(form)}
          >
            {saving ? "Dispatching…" : "Dispatch & Fulfill"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Notes editor ─────────────────────────────────────────────────────────────

function NotesEditor({ order, onSave, saving }) {
  const [adminNote, setAdminNote] = useState(order.adminNote || "");
  const [customerNote, setCustomerNote] = useState(order.customerNote || "");
  const [dirty, setDirty] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Admin Note (internal)</span>
        <textarea
          value={adminNote}
          onChange={(e) => { setAdminNote(e.target.value); setDirty(true); }}
          rows={3} placeholder="Internal note — not visible to customer..."
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Customer Note (sent with dispatch)</span>
        <textarea
          value={customerNote}
          onChange={(e) => { setCustomerNote(e.target.value); setDirty(true); }}
          rows={3} placeholder="Message sent to customer via WhatsApp & email on dispatch..."
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>
      {dirty && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary btn-small" disabled={saving}
            onClick={() => { onSave({ adminNote, customerNote }); setDirty(false); }}>
            {saving ? "Saving…" : "Save Notes"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tags editor ───────────────────────────────────────────────────────────────

function TagsEditor({ tags, onSave, saving }) {
  const [input, setInput] = useState("");
  const [localTags, setLocalTags] = useState(tags || []);

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !localTags.includes(tag)) {
      const next = [...localTags, tag];
      setLocalTags(next);
      onSave({ tags: next });
    }
    setInput("");
  };

  const removeTag = (t) => {
    const next = localTags.filter((x) => x !== t);
    setLocalTags(next);
    onSave({ tags: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {localTags.map((tag) => (
          <span key={tag} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)",
            borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, color: "#1d4ed8"
          }}>
            {tag}
            <button type="button" onClick={() => removeTag(tag)} disabled={saving}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        {localTags.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>No tags yet</span>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Type tag and press Add..."
          onKeyDown={(e) => e.key === "Enter" && addTag()}
          style={{ flex: 1, padding: "6px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
        />
        <button type="button" className="btn btn-secondary btn-small" onClick={addTag} disabled={saving || !input.trim()}>
          Add Tag
        </button>
      </div>
    </div>
  );
}

// ── Invoice section ───────────────────────────────────────────────────────────

function InvoiceSection({ orderId, invoice, onInvoiceGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [downloading, setDownloading] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setErr("");
    try {
      const result = await generateInvoiceForOrder(orderId, { invoiceDate: new Date().toISOString().slice(0, 10) });
      onInvoiceGenerated(result?.invoice || result);
    } catch (e) {
      setErr(e.message || "Failed to generate invoice.");
    } finally {
      setGenerating(false);
    }
  };

  const download = async () => {
    if (!invoice?.id) return;
    setDownloading(true);
    try {
      const data = await fetchInvoiceDownloadData(invoice.id);
      const content = data?.content || JSON.stringify(data, null, 2);
      const blob = new Blob([content], { type: data?.contentType || "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data?.fileName || `invoice-${invoice.invoiceNumber}.html`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message || "Failed to download.");
    } finally {
      setDownloading(false);
    }
  };

  if (invoice) {
    return (
      <div style={{ background: "rgba(22,163,74,0.04)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Invoice #{invoice.invoiceNumber}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{formatDateTime(invoice.invoiceDate || invoice.createdAt)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary btn-small" disabled={downloading} onClick={download}>
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={generate} disabled={generating}>
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>
        {err && <p style={{ color: "var(--danger)", fontSize: 12, margin: "8px 0 0" }}>{err}</p>}
      </div>
    );
  }

  return (
    <div style={{ background: "rgba(234,179,8,0.04)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No invoice generated yet.</p>
        <button type="button" className="btn btn-primary btn-small" disabled={generating} onClick={generate}>
          {generating ? "Generating…" : "Generate Invoice"}
        </button>
      </div>
      {err && <p style={{ color: "var(--danger)", fontSize: 12, margin: "8px 0 0" }}>{err}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canView = hasPermission(session, "orders.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [couriers, setCouriers] = useState([]);

  const [processingModal, setProcessingModal] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const [processingSaving, setProcessingSaving] = useState(false);

  const [fulfillModal, setFulfillModal] = useState(false);
  const [fulfillError, setFulfillError] = useState("");
  const [fulfillSaving, setFulfillSaving] = useState(false);

  const [noteSaving, setNoteSaving] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);

  const reload = async () => {
    setError("");
    try {
      const [ord, inv] = await Promise.allSettled([
        fetchOrderDetail(orderId),
        fetchInvoiceForOrder(orderId)
      ]);
      if (ord.status === "fulfilled") setOrder(ord.value);
      else setError(ord.reason?.message || "Failed to load order.");
      if (inv.status === "fulfilled" && inv.value?.invoiceNumber) setInvoice(inv.value);
    } catch (e) {
      setError(e.message || "Failed to load.");
    }
  };

  useEffect(() => {
    if (!canView) return;
    const init = async () => {
      setLoading(true);
      await reload();
      try {
        const cs = await fetchShippingCouriers();
        setCouriers(Array.isArray(cs) ? cs : []);
      } catch {
        setCouriers([]);
      }
      setLoading(false);
    };
    init();
  }, [orderId]);

  const handleUpdateOrder = async (patch) => {
    const updated = await updateOrder(orderId, patch);
    setOrder(updated);
  };

  const handleMarkProcessing = async (data) => {
    setProcessingSaving(true);
    setProcessingError("");
    try {
      await handleUpdateOrder({ ...data, orderStatus: "processing" });
      setProcessingModal(false);
    } catch (e) {
      setProcessingError(e.message || "Failed to mark as processing.");
    } finally {
      setProcessingSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    setCancelSaving(true);
    try {
      await handleUpdateOrder({ orderStatus: "cancelled" });
    } catch (e) {
      setError(e.message || "Failed to cancel.");
    } finally {
      setCancelSaving(false);
    }
  };

  const handleNoteSave = async (patch) => {
    setNoteSaving(true);
    try {
      await handleUpdateOrder(patch);
    } catch (e) {
      setError(e.message || "Failed to save notes.");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleFulfill = async (form) => {
    setFulfillSaving(true);
    setFulfillError("");
    try {
      const selectedCourier = couriers.find((c) => c.id === form.courierProfileId);

      // 1. Create shipment
      const { shipment } = await createShipment({
        orderId: order.id,
        courierProfileId: form.courierProfileId || undefined,
        packageCount: 1,
        adminNotes: form.customerNote
      });

      // 2. Update tracking
      if (form.trackingId && form.courierProfileId) {
        await updateShipmentTracking(shipment.id, {
          courierProfileId: form.courierProfileId,
          trackingId: form.trackingId,
          dispatchDate: form.dispatchDate,
          expectedDeliveryDate: form.expectedDeliveryDate,
          newShipmentStatus: "shipped"
        });
      }

      // 3. Upload POD image if provided
      if (form.podFile) {
        try { await uploadShipmentPod(shipment.id, form.podFile); } catch { /* non-fatal */ }
      }

      // 4. Save customer note + mark fulfilled
      await handleUpdateOrder({
        orderStatus: "fulfilled",
        customerNote: form.customerNote
      });

      // 5. WhatsApp notification to customer
      const phone = order.billingAddress?.mobile || order.shippingAddress?.mobile || order.customerMobile || "";
      if (phone && form.trackingId) {
        const courierName = selectedCourier?.courierName || "courier";
        const waMsg = [
          `Hi ${order.customerName || "there"}, your order #${order.orderNo} has been dispatched!`,
          `Courier: ${courierName}`,
          `Tracking ID: ${form.trackingId}`,
          form.expectedDeliveryDate ? `Expected Delivery: ${form.expectedDeliveryDate}` : "",
          form.customerNote || order.customerNote || ""
        ].filter(Boolean).join("\n");
        const waLink = buildWaLink(phone, waMsg);
        if (waLink) window.open(waLink, "_blank");
      }

      // 6. Email notification
      try { await sendTrackingEmail(shipment.id, {}); } catch { /* non-fatal */ }

      setFulfillModal(false);
      await reload();
    } catch (e) {
      setFulfillError(e.message || "Failed to fulfill order.");
    } finally {
      setFulfillSaving(false);
    }
  };

  // ── Render ──

  if (!canView) return <ErrorBlock message="You do not have permission to view orders." />;
  if (loading) return <LoadingBlock label="Loading order..." />;
  if (error && !order) return <ErrorBlock message={error} onRetry={reload} />;
  if (!order) return <ErrorBlock message="Order not found." />;

  const canProcess = !["processing", "fulfilled", "cancelled", "delivered"].includes(order.orderStatus);
  const canFulfill = order.orderStatus === "processing" && invoice;
  const canCancel = !["cancelled", "fulfilled", "delivered"].includes(order.orderStatus);
  const customerPhone = order.billingAddress?.mobile || order.shippingAddress?.mobile || order.customerMobile || "";

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Breadcrumb + back */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          <span style={{ cursor: "pointer", color: "var(--brand)" }} onClick={() => navigate("/orders")}>Orders</span>
          <span style={{ margin: "0 6px" }}>›</span>
          <span>View Order</span>
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => navigate("/orders")}>
          ← Go Back
        </button>
      </div>

      {/* Title */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>
        View Order (# {order.orderNo || order.id})
      </h1>

      {/* Status chips */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <StatusChip label="Order Status" value={order.orderStatus} />
          <StatusChip label="Acceptance Status" value={order.acceptanceStatus} />
          <StatusChip label="Payment Mode" value={order.paymentMethod} />
          <StatusChip label="Payment Status" value={order.paymentStatus} />
        </div>
      </div>

      {/* Payment gateway info */}
      {order.gatewayTxnId && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 18px", marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
          <span><strong style={{ color: "var(--text)" }}>Payment Gateway:</strong> {humanize(order.paymentMethod)}</span>
          <span><strong style={{ color: "var(--text)" }}>Payment ID:</strong> {order.gatewayTxnId}</span>
          {order.checkoutSessionId && <span><strong style={{ color: "var(--text)" }}>Order ID:</strong> {order.checkoutSessionId}</span>}
        </div>
      )}

      {/* Customer / Billing / Shipping */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Customer Details</h4>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{order.customerName}</div>
          {order.customerEmail && <div style={{ fontSize: 12, color: "var(--muted)" }}>{order.customerEmail}</div>}
          {customerPhone && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{customerPhone}</span>
              {customerPhone && (
                <a href={buildWaLink(customerPhone, `Hi ${order.customerName || "there"}, this is regarding your order #${order.orderNo}.`)}
                  target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#25d366", textDecoration: "none" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 00-8.7 15l-1.2 5 5.1-1.3A10 10 0 1012 2zm5.1 13.4c-.2.6-1.2 1.2-1.7 1.3-.5.1-1.1.2-3.1-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3 1 1.7 2.4 2.7 1.8 1.3 3.3 1.7 3.7 1.9.4.2.7.1.9-.1.3-.3 1-.9 1.2-1.2.2-.3.4-.3.7-.2l1.8.9c.3.2.5.3.6.5.1.2.1.9-.1 1.4z" />
                  </svg>
                  WA
                </a>
              )}
            </div>
          )}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Billing Address</h4>
          <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>{formatAddress(order.billingAddress)}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Shipping Address</h4>
          <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>{formatAddress(order.shippingAddress)}</div>
        </div>
      </div>

      {/* Products + Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14, marginBottom: 14 }}>
        {/* Products table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Product</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Price</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Tax Rate</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Qty</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((item, i) => (
                <tr key={i} style={{ borderBottom: i < order.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.sku && <div style={{ fontSize: 11, color: "var(--muted)" }}>SKU: {item.sku}</div>}
                    {item.hsnCode && <div style={{ fontSize: 11, color: "var(--muted)" }}>HSN: {item.hsnCode}</div>}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatCurrencyInr(item.unitPriceUsed)}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center", color: "var(--muted)" }}>
                    {item.gstRate}%
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>{item.qty}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {formatCurrencyInr(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary panel */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Summary</h4>
          {[
            ["Order Total", order.pricing?.productSubtotal],
            ["Item Discount", order.pricing?.discountAmount ? `-${formatCurrencyInr(order.pricing.discountAmount)}` : null],
            ["Taxable Amount", order.pricing?.taxableValue],
            [`GST`, order.pricing?.gstTotal],
            ["Shipping Charges", order.pricing?.shippingCharge],
          ].map(([label, val]) => val !== null && val !== undefined ? (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
              <span>{label}</span>
              <span style={{ color: typeof val === "string" && val.startsWith("-") ? "var(--danger)" : "var(--text)" }}>
                {typeof val === "string" ? val : formatCurrencyInr(val)}
              </span>
            </div>
          ) : null)}
          <div style={{ borderTop: "1.5px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
              <span>Total</span>
              <span>{formatCurrencyInr(order.orderTotal)}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800,
              color: "#fff", background: "var(--success)", borderRadius: 8, padding: "10px 12px"
            }}>
              <span>Amount Payable</span>
              <span>{formatCurrencyInr(order.orderTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tracking info */}
      {order.trackingDetails?.trackingId && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Shipment & Tracking</h4>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <span><strong>Courier:</strong> {order.trackingDetails.courierName || "—"}</span>
            <span><strong>Tracking ID:</strong> {order.trackingDetails.trackingId}</span>
            {order.trackingDetails.dispatchDate && <span><strong>Dispatched:</strong> {order.trackingDetails.dispatchDate}</span>}
            {order.trackingDetails.expectedDeliveryDate && <span><strong>Expected:</strong> {order.trackingDetails.expectedDeliveryDate}</span>}
          </div>
          {customerPhone && order.trackingDetails.trackingId && (
            <a
              href={buildWaLink(customerPhone, `Hi ${order.customerName}, your order #${order.orderNo} tracking:\nCourier: ${order.trackingDetails.courierName}\nTracking ID: ${order.trackingDetails.trackingId}`)}
              target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12, fontWeight: 600, color: "#25d366", textDecoration: "none" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 00-8.7 15l-1.2 5 5.1-1.3A10 10 0 1012 2zm5.1 13.4c-.2.6-1.2 1.2-1.7 1.3-.5.1-1.1.2-3.1-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3 1 1.7 2.4 2.7 1.8 1.3 3.3 1.7 3.7 1.9.4.2.7.1.9-.1.3-.3 1-.9 1.2-1.2.2-.3.4-.3.7-.2l1.8.9c.3.2.5.3.6.5.1.2.1.9-.1 1.4z" />
              </svg>
              Share Tracking on WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Invoice section */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Invoice</h4>
        <InvoiceSection orderId={orderId} invoice={invoice} onInvoiceGenerated={setInvoice} />
      </div>

      {/* Notes */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Notes</h4>
        <NotesEditor order={order} onSave={handleNoteSave} saving={noteSaving} />
      </div>

      {/* Tags */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Tags</h4>
        <TagsEditor tags={order.tags} onSave={handleNoteSave} saving={noteSaving} />
      </div>

      {/* Fulfillment items (if any) */}
      {(order.fulfillmentItems || []).length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Processing Items</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--muted)" }}>Sr#</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--muted)" }}>Product</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--muted)" }}>Fulfill Qty</th>
              </tr>
            </thead>
            <tbody>
              {order.fulfillmentItems.map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", color: "var(--muted)" }}>{item.srNo}</td>
                  <td style={{ padding: "8px 12px" }}>{item.title}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{item.fulfillQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 14 }}>{error}</p>}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
        {canCancel && (
          <button type="button" className="btn btn-secondary" disabled={cancelSaving} onClick={handleCancelOrder}
            style={{ color: "var(--danger)", borderColor: "rgba(220,38,38,0.3)" }}>
            {cancelSaving ? "Cancelling…" : "Cancel Order"}
          </button>
        )}
        {canProcess && (
          <button type="button" className="btn btn-primary" onClick={() => { setProcessingModal(true); setProcessingError(""); }}>
            Mark as Processing
          </button>
        )}
        {canFulfill && (
          <button type="button" className="btn btn-primary" style={{ background: "#16a34a" }}
            onClick={() => { setFulfillModal(true); setFulfillError(""); }}>
            Convert to Fulfill
          </button>
        )}
      </div>

      {/* Modals */}
      {processingModal && (
        <ProcessingModal
          order={order}
          onClose={() => setProcessingModal(false)}
          onSave={handleMarkProcessing}
          saving={processingSaving}
          error={processingError}
        />
      )}
      {fulfillModal && (
        <FulfillModal
          order={order}
          invoice={invoice}
          couriers={couriers}
          onClose={() => setFulfillModal(false)}
          onSave={handleFulfill}
          saving={fulfillSaving}
          error={fulfillError}
        />
      )}
    </div>
  );
}
