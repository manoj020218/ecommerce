const crypto = require("node:crypto");
const { readAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const {
  istDayKey,
  incrementProductView,
  sumProductViews,
  getTrackingStartDay
} = require("../../database/product-views-store");

const DAY_MS = 86400000;

// Crawlers / link previews / monitors must not inflate "visitors". Real
// search crawlers mostly get the server-rendered page and never call the
// product API at all; this catches the ones that do run JavaScript.
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp/i;

// Approximate unique visitors: hash(ip + user-agent) seen per product today,
// kept in memory only (reset each IST day and on restart).
let seenDay = "";
let seen = new Set();

function isBot(userAgent) {
  const ua = String(userAgent || "");
  return !ua || BOT_UA.test(ua);
}

// Called from the public product-detail endpoint. Never throws and never
// waits on disk, so it cannot slow down or break a product page.
function recordProductView(productId, req) {
  try {
    const ua = req?.headers?.["user-agent"] || "";
    if (!productId || isBot(ua)) return;
    const today = istDayKey();
    if (today !== seenDay) {
      seenDay = today;
      seen = new Set();
    }
    const key = crypto
      .createHash("sha1")
      .update(`${productId}|${req.ip || ""}|${ua}`)
      .digest("base64");
    const isNewVisitor = !seen.has(key);
    if (isNewVisitor) seen.add(key);
    incrementProductView(productId, isNewVisitor).catch(() => {});
  } catch (_error) {
    // analytics must never affect the storefront
  }
}

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

function isCountableOrder(order) {
  // Website orders only: walk-in orders are not driven by page visits, and
  // cancelled orders are not sales.
  if (order.isWalkInOrder) return false;
  return String(order.orderStatus || "").toLowerCase() !== "cancelled";
}

async function getProductPerformance(range = "30d", limit = 50) {
  const days = RANGE_DAYS[range] || 30;
  const toDay = istDayKey();
  const fromDay = istDayKey(Date.now() - (days - 1) * DAY_MS);

  const [viewTotals, authStore, catalogStore, trackingSince] = await Promise.all([
    sumProductViews(fromDay, toDay),
    readAuthStore(),
    readCatalogStore(),
    getTrackingStartDay()
  ]);

  const products = new Map(
    (Array.isArray(catalogStore.products) ? catalogStore.products : []).map((p) => [p.id, p])
  );

  const sales = new Map();
  for (const order of Array.isArray(authStore.orders) ? authStore.orders : []) {
    if (!isCountableOrder(order)) continue;
    const orderDay = istDayKey(Date.parse(order.createdAt || ""));
    if (!orderDay || orderDay < fromDay || orderDay > toDay) continue;
    const countedInOrder = new Set();
    for (const item of Array.isArray(order.items) ? order.items : []) {
      if (!item.productId) continue;
      const s = sales.get(item.productId) || { orders: 0, units: 0, revenue: 0 };
      if (!countedInOrder.has(item.productId)) {
        s.orders += 1;
        countedInOrder.add(item.productId);
      }
      s.units += Number(item.qty || 0);
      s.revenue += Number(item.lineTotal || 0);
      sales.set(item.productId, s);
    }
  }

  const ids = new Set([...viewTotals.keys(), ...sales.keys()]);
  const rows = [];
  for (const id of ids) {
    const v = viewTotals.get(id) || { views: 0, visitors: 0 };
    const s = sales.get(id) || { orders: 0, units: 0, revenue: 0 };
    const p = products.get(id);
    rows.push({
      productId: id,
      title: p?.title || "(deleted product)",
      slug: p?.slug || "",
      sku: p?.sku || "",
      views: v.views,
      visitors: v.visitors,
      orders: s.orders,
      units: s.units,
      revenue: Math.round(s.revenue),
      // % of unique visitors who ordered it (null when there were no visitors)
      conversionPct: v.visitors > 0 ? Math.round((s.orders / v.visitors) * 1000) / 10 : null
    });
  }

  rows.sort((a, b) => b.views - a.views || b.revenue - a.revenue);

  const totals = rows.reduce(
    (t, r) => ({
      views: t.views + r.views,
      visitors: t.visitors + r.visitors,
      orders: t.orders + r.orders,
      revenue: t.revenue + r.revenue
    }),
    { views: 0, visitors: 0, orders: 0, revenue: 0 }
  );

  return {
    range,
    fromDay,
    toDay,
    trackingSince,
    totals,
    rows: rows.slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)))
  };
}

module.exports = { recordProductView, getProductPerformance };
