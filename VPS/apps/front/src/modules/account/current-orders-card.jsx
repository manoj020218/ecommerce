import { Link } from "react-router-dom";

// "Current order" timeline at the top of My Account (2026-10-03): every order
// that is not yet delivered / picked up / cancelled, step by step, with the
// courier tracking link once shipped. Understands both storefront and walk-in
// order statuses.

const BRAND = "#E8231A";
const PACKED = ["packed", "ready_to_dispatch", "ready_for_pickup", "shipped", "in_transit", "out_for_delivery", "delivered", "picked_up"];
const SHIPPED = ["shipped", "in_transit", "out_for_delivery", "delivered"];

function lower(value) {
  return String(value || "").toLowerCase();
}

export function orderProgress(order) {
  const ship = lower(order.shipmentStatus);
  const status = lower(order.orderStatus);
  const pickup = lower(order.shippingMethod) === "self_pickup";
  const paid = lower(order.paymentStatus) === "paid" || lower(order.manualPaymentStatus) === "verified";
  const delivered = ["delivered", "picked_up"].includes(ship) || ["delivered", "completed"].includes(status);
  const shipped = delivered || SHIPPED.includes(ship) || ["dispatched", "fulfilled"].includes(status);
  const packed = shipped || PACKED.includes(ship) || ["packed", "ready_for_pickup"].includes(status);
  const cancelled = status === "cancelled" || ship === "cancelled";

  const steps = pickup
    ? [
        ["Order placed", true],
        ["Payment received", paid],
        ["Ready for pickup", packed],
        ["Picked up", delivered]
      ]
    : [
        ["Order placed", true],
        ["Payment received", paid],
        ["Packed", packed],
        ["Shipped", shipped],
        ["Delivered", delivered]
      ];
  return { steps, delivered, cancelled, pickup, shipped };
}

function Timeline({ steps }) {
  const current = steps.findIndex(([, done]) => !done);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", margin: "12px 0 4px" }}>
      {steps.map(([label, done], i) => {
        const active = i === current;
        return (
          <div key={label} style={{ flex: 1, minWidth: 0, textAlign: "center", position: "relative" }}>
            {i > 0 ? (
              <div style={{ position: "absolute", top: 10, right: "50%", width: "100%", height: 3, background: done || active ? BRAND : "#e5e7eb", opacity: done ? 1 : active ? 0.35 : 1 }} />
            ) : null}
            <div style={{
              position: "relative", width: 22, height: 22, borderRadius: "50%", margin: "0 auto",
              background: done ? BRAND : "#fff", border: `3px solid ${done || active ? BRAND : "#d1d5db"}`,
              color: "#fff", fontSize: 12, fontWeight: 900, lineHeight: "16px"
            }}>
              {done ? "✓" : ""}
            </div>
            <div style={{ fontSize: 11, marginTop: 5, fontWeight: active ? 800 : 600, color: done || active ? "#111827" : "#9ca3af", lineHeight: 1.3, padding: "0 2px" }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CurrentOrdersCard({ orders }) {
  const active = (Array.isArray(orders) ? orders : [])
    .map((order) => ({ order, progress: orderProgress(order) }))
    .filter(({ progress }) => !progress.delivered && !progress.cancelled)
    .slice(0, 3);
  if (!active.length) return null;

  return (
    <section style={{ background: "#fff", border: "1px solid #eef0f3", borderRadius: 16, padding: "16px 18px", margin: "0 0 16px" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>🚚 Current order{active.length > 1 ? "s" : ""}</div>
      {active.map(({ order, progress }) => (
        <div key={order.id} style={{ borderTop: "1px solid #f1f5f9", marginTop: 12, paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
            <strong>{order.orderNo}</strong>
            <span style={{ color: "#6b7280" }}>₹{Number(order.orderTotal || 0).toLocaleString("en-IN")}</span>
          </div>
          <Timeline steps={progress.steps} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 13 }}>
            {progress.shipped && order.trackingId ? (
              <span style={{ color: "#374151" }}>
                {order.courierName ? `${order.courierName} · ` : ""}AWB <strong>{order.trackingId}</strong>
              </span>
            ) : null}
            {progress.shipped && order.trackingUrl ? (
              <a href={order.trackingUrl} target="_blank" rel="noreferrer" style={{ color: BRAND, fontWeight: 800, textDecoration: "none" }}>Track shipment ↗</a>
            ) : null}
            <Link to={`/account/orders/${order.id}`} style={{ color: "#111827", fontWeight: 700, textDecoration: "none", marginLeft: "auto" }}>Order details →</Link>
          </div>
        </div>
      ))}
    </section>
  );
}
