const { readShippingStore } = require("../../database/shipping-store");

// Recent tracking / AWB numbers for one courier (2026-10-10). Admin "Tracking
// Number" boxes use it to start from the last number (courier booklets are
// near-sequential, e.g. Shree Maruti …86664 → …86665) and to warn when a
// number was already used on another shipment. Read-only.
async function listRecentTrackingIds(courierProfileId, limit = 5) {
  const store = await readShippingStore();
  const rows = (Array.isArray(store.shipments) ? store.shipments : [])
    .filter((s) => s && s.trackingId && (!courierProfileId || s.courierProfileId === courierProfileId))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const recent = [];
  const seen = new Set();
  for (const s of rows) {
    const id = String(s.trackingId).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (recent.length < Math.min(Math.max(Number(limit) || 5, 1), 10)) {
      recent.push({ trackingId: id, orderNo: s.orderNo || "", createdAt: s.createdAt || "" });
    }
  }

  // Every number ever used with this courier → duplicate warning in the UI.
  const used = rows.slice(0, 1000).map((s) => ({ trackingId: String(s.trackingId).trim(), orderNo: s.orderNo || "" }));
  return { recent, used };
}

module.exports = { listRecentTrackingIds };
