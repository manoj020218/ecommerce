import { useEffect, useState } from "react";
import { fetchCouriers } from "../shipping/shipping.api";
import { updateWalkInOrderStatus } from "./walkin-orders.api";

// One popup for every walk-in fulfilment step (2026-10-02): Packed, Shipped
// (with courier + tracking), Ready for Pickup, Picked up / Delivered.
// "Send message to buyer" is ticked by default — the buyer gets an email +
// WhatsApp for that step (texts editable in Marketing → Templates).

const STAGES = {
  packed: {
    title: "Mark as Packed",
    help: "Buyer is told the order is packed and will ship shortly.",
    noteLabel: "Note for buyer (optional)",
    notePlaceholder: "e.g. 2 boxes"
  },
  dispatched: {
    title: "Mark as Shipped",
    help: "With a courier + tracking number the buyer gets a tracking link. Without one (own delivery / transport), write the delivery details below — they are sent to the buyer.",
    noteLabel: "Delivery details for buyer",
    notePlaceholder: "e.g. Sent by ABC Transport, LR no. 4521, reaching Kota tomorrow"
  },
  ready_for_pickup: {
    title: "Ready for Pickup",
    help: "Buyer gets the pickup address, timings and Google Maps link.",
    noteLabel: "Note for buyer (optional)",
    notePlaceholder: "e.g. Ask for Ramesh at the counter"
  },
  completed: {
    title: "Complete Order",
    help: "Buyer gets a short thank-you message.",
    noteLabel: "",
    notePlaceholder: ""
  }
};

const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, fontFamily: "inherit" };
const labelText = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };

export function WalkInStageModal({ order, stage, onClose, onDone }) {
  const config = STAGES[stage] || STAGES.completed;
  const isSelfPickup = order.shippingMethod === "self_pickup";
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [couriers, setCouriers] = useState([]);
  const [courierProfileId, setCourierProfileId] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (stage !== "dispatched") return;
    fetchCouriers().then((rows) => setCouriers((Array.isArray(rows) ? rows : rows?.items || []).filter((c) => c.isActive !== false))).catch(() => {});
  }, [stage]);

  const title = stage === "completed" ? (isSelfPickup ? "Picked Up by Customer" : "Mark Delivered") : config.title;

  const submit = async () => {
    setError("");
    if (stage === "dispatched" && courierProfileId && !trackingId.trim()) { setError("Enter the tracking / AWB number for the selected courier."); return; }
    if (stage === "dispatched" && !courierProfileId && notify && !note.trim()) { setError("Without a courier, write the delivery details for the buyer (or untick the message)."); return; }
    setSaving(true);
    try {
      const payload = { orderStatus: stage, adminNote: note.trim(), notifyCustomer: notify };
      if (stage === "dispatched" && courierProfileId) {
        payload.courierProfileId = courierProfileId;
        payload.trackingId = trackingId.trim();
        payload.expectedDeliveryDate = expectedDeliveryDate;
      }
      const data = await updateWalkInOrderStatus(order.id, payload);
      onDone?.(data, { notified: notify });
    } catch (e) {
      setError(e.message || "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: "22px 26px", width: "100%", maxWidth: 460, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{title}</h3>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--muted)" }}>{order.orderNo} · {order.customerName || order.companyName || ""}</p>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--muted)" }}>{config.help}</p>

        {stage === "dispatched" && (
          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <label>
              <span style={labelText}>Courier</span>
              <select style={input} value={courierProfileId} onChange={(e) => setCourierProfileId(e.target.value)}>
                <option value="">No courier — own delivery / transport</option>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.courierName || c.courierCode}</option>)}
              </select>
            </label>
            {courierProfileId && (
              <>
                <label>
                  <span style={labelText}>Tracking / AWB number</span>
                  <input style={input} value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="e.g. 1234567890" />
                </label>
                <label>
                  <span style={labelText}>Expected delivery date (optional)</span>
                  <input type="date" style={input} value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
                </label>
              </>
            )}
          </div>
        )}

        {config.noteLabel && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={labelText}>{stage === "dispatched" && courierProfileId ? "Note (optional)" : config.noteLabel}</span>
            <textarea rows={2} style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder={config.notePlaceholder} />
          </label>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Send message to buyer (email + WhatsApp)
        </label>

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : title}</button>
        </div>
      </div>
    </div>
  );
}
