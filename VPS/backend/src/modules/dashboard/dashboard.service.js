const { readAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { readShippingStore } = require("../../database/shipping-store");
const { calculateAvailableQty } = require("../products/products.model");

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MANUAL_PAYMENT_METHODS = new Set(["direct_bank_transfer", "manual_upi"]);

// "Today" and the 7-day trend need to mean the store's business day (India),
// not the server's — this VPS runs on UTC+1, so computing day boundaries
// with plain `new Date().getFullYear()/getMonth()/getDate()` (server-local)
// misattributes any order placed between ~7:30pm-11:59pm server time
// (which is already the next calendar day in IST) to the wrong day. India
// has no DST, so a fixed +5:30 offset is always correct.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;

function istDayStartMs(utcMs) {
  const shifted = utcMs + IST_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  return t >= istDayStartMs(Date.now());
}

function isPendingPayment(order) {
  const status = String(order.orderStatus || "").toLowerCase();
  if (status === "cancelled") return false;
  const method = String(order.paymentMethod || "").toLowerCase();
  const payStatus = String(order.paymentStatus || "").toLowerCase();
  if (payStatus === "paid") return false;
  if (method === "cod") return false;
  if (MANUAL_PAYMENT_METHODS.has(method)) {
    return String(order.manualPaymentStatus || "").toLowerCase() !== "verified";
  }
  return payStatus !== "paid";
}

async function getDashboardStats() {
  const [authStore, catalogStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore()
  ]);

  const orders = Array.isArray(authStore.orders) ? authStore.orders : [];
  const products = Array.isArray(catalogStore.products) ? catalogStore.products : [];

  // Shipment status lives in a separate shipments store keyed by orderId —
  // it was never on the order record itself, so recentOrderList's
  // shipmentStatus always read as blank ("pending" pill for every order)
  // until this was joined in, same as orders.service.js's buildOrderSummary.
  const latestShipmentByOrderId = new Map();
  for (const shipment of Array.isArray(shippingStore.shipments) ? shippingStore.shipments : []) {
    const current = latestShipmentByOrderId.get(shipment.orderId);
    const currentTs = current ? Date.parse(current.updatedAt || current.createdAt || "") : -Infinity;
    const nextTs = Date.parse(shipment.updatedAt || shipment.createdAt || "");
    if (!current || nextTs >= currentTs) {
      latestShipmentByOrderId.set(shipment.orderId, shipment);
    }
  }

  // Today stats
  const todayOrders = orders.filter((o) => isToday(o.createdAt));
  const todayRevenue = todayOrders
    .filter((o) => String(o.paymentStatus || "").toLowerCase() === "paid")
    .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);

  const pendingPayments = orders.filter(isPendingPayment).length;

  // Low + out of stock
  const lowStockCount = products.filter((p) => {
    const avail = calculateAvailableQty(p);
    if (avail <= 0) return !p.allowBackorder;
    const threshold = Number(p.lowStockThreshold || 0);
    return threshold > 0 && avail <= threshold;
  }).length;

  // Last 7 days order trend (IST calendar days — see istDayStartMs above)
  const nowMs = Date.now();
  const todayStartMs = istDayStartMs(nowMs);
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const dayStartMs = todayStartMs - i * DAY_MS;
    const dayEndMs = dayStartMs + DAY_MS;
    const count = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= dayStartMs && t < dayEndMs;
    }).length;
    const revenue = orders
      .filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return (
          t >= dayStartMs &&
          t < dayEndMs &&
          String(o.paymentStatus || "").toLowerCase() === "paid"
        );
      })
      .reduce((s, o) => s + Number(o.grandTotal || 0), 0);
    // Adding the offset back gives the IST wall-clock instant for this day
    // boundary, so getUTCDay() reads the correct IST weekday label.
    const istWeekday = new Date(dayStartMs + IST_OFFSET_MS).getUTCDay();
    last7.push({ day: DAY_LABELS[istWeekday], date: new Date(dayStartMs).toISOString(), count, revenue });
  }

  // Payment method breakdown (last 30 days — a rolling window, not
  // calendar-aligned, so the server/IST distinction doesn't matter here)
  const thirtyDaysAgo = new Date(nowMs - 30 * DAY_MS);
  const recentOrders = orders.filter((o) => new Date(o.createdAt) >= thirtyDaysAgo);
  const methodCounts = {};
  recentOrders.forEach((o) => {
    const m = String(o.paymentMethod || "other").toLowerCase();
    methodCounts[m] = (methodCounts[m] || 0) + 1;
  });
  const total = recentOrders.length || 1;
  const METHOD_LABELS = {
    razorpay: "Online PG",
    cashfree: "Online PG",
    payu: "Online PG",
    stripe: "Online PG",
    cod: "Cash on Delivery",
    direct_bank_transfer: "Bank Transfer",
    manual_upi: "UPI Manual",
    cheque: "Cheque",
    online_payment_link: "Online PG",
    credit_pay_later: "Credit / Later",
    cash: "Cash",
    other: "Other"
  };
  const methodGrouped = {};
  Object.entries(methodCounts).forEach(([m, c]) => {
    const label = METHOD_LABELS[m] || m;
    methodGrouped[label] = (methodGrouped[label] || 0) + c;
  });
  const paymentBreakdown = Object.entries(methodGrouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / total) * 100)
    }));

  // Recent 10 orders
  const recentOrderList = [...orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map((o) => {
      const billing = o.billingAddress || o.shippingAddress || {};
      const name =
        billing.name || billing.companyName || o.companyName || "—";
      const city = billing.city || billing.district || "";
      return {
        orderId: o.id,
        orderNo: o.orderNo,
        customerName: name,
        customerCity: city,
        grandTotal: Number(o.grandTotal || 0),
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        manualPaymentStatus: o.manualPaymentStatus,
        shipmentStatus: latestShipmentByOrderId.get(o.id)?.shipmentStatus || "pending_packing",
        orderStatus: o.orderStatus,
        createdAt: o.createdAt
      };
    });

  return {
    todayOrderCount: todayOrders.length,
    todayRevenue,
    pendingPayments,
    lowStockCount,
    last7DaysTrend: last7,
    paymentBreakdown,
    recentOrders: recentOrderList
  };
}

module.exports = { getDashboardStats };
