const { readAuthStore } = require("../../database/auth-store");

// Order trend for the dashboard chart toggle (Week / Month / Year).
// Same IST business-day rule as dashboard.service.js: India has no DST, so a
// fixed +5:30 offset turns server time into the store's calendar.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function istParts(ms) {
  const d = new Date(ms + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() };
}

function istDayStartMs(ms) {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

function istMonthStartMs(y, m) {
  return Date.UTC(y, m, 1) - IST_OFFSET_MS;
}

function buildBuckets(range, nowMs) {
  const buckets = [];
  if (range === "year") {
    const { y, m } = istParts(nowMs);
    const current = y * 12 + m; // months since year 0
    for (let i = 11; i >= 0; i--) {
      const idx = current - i;
      const yy = Math.floor(idx / 12);
      const mm = idx % 12;
      const start = istMonthStartMs(yy, mm);
      const end = istMonthStartMs(Math.floor((idx + 1) / 12), (idx + 1) % 12);
      // show the year on the first bar and on every January
      buckets.push({ label: `${MONTH_LABELS[mm]}${mm === 0 || i === 11 ? " '" + String(yy).slice(2) : ""}`, start, end });
    }
    return buckets;
  }
  const days = range === "month" ? 30 : 7;
  const today = istDayStartMs(nowMs);
  for (let i = days - 1; i >= 0; i--) {
    const start = today - i * DAY_MS;
    const p = istParts(start);
    const label = range === "month" ? `${p.d} ${MONTH_LABELS[p.m]}` : DAY_LABELS[p.wd];
    buckets.push({ label, start, end: start + DAY_MS });
  }
  return buckets;
}

async function getOrderTrend(range = "week") {
  const safeRange = ["week", "month", "year"].includes(range) ? range : "week";
  const authStore = await readAuthStore();
  const orders = Array.isArray(authStore.orders) ? authStore.orders : [];
  const buckets = buildBuckets(safeRange, Date.now()).map((b) => ({
    ...b,
    count: 0,
    revenue: 0, // paid orders (same meaning as the original 7-day chart)
    sales: 0 // all non-cancelled orders, paid or not (COD / bank transfer pending)
  }));

  for (const order of orders) {
    const t = Date.parse(order.createdAt || "");
    if (Number.isNaN(t)) continue;
    const bucket = buckets.find((b) => t >= b.start && t < b.end);
    if (!bucket) continue;
    const cancelled = String(order.orderStatus || "").toLowerCase() === "cancelled";
    bucket.count += 1;
    if (!cancelled) bucket.sales += Number(order.grandTotal || 0);
    if (String(order.paymentStatus || "").toLowerCase() === "paid") {
      bucket.revenue += Number(order.grandTotal || 0);
    }
  }

  return {
    range: safeRange,
    points: buckets.map((b) => ({
      label: b.label,
      date: new Date(b.start).toISOString(),
      count: b.count,
      revenue: Math.round(b.revenue),
      sales: Math.round(b.sales)
    }))
  };
}

module.exports = { getOrderTrend };
