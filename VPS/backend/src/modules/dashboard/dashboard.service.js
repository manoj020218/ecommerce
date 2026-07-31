const { readAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { calculateAvailableQty } = require("../products/products.model");

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MANUAL_PAYMENT_METHODS = new Set(["direct_bank_transfer", "manual_upi"]);

function todayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start, end: now };
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const { start } = todayBounds();
  return new Date(dateStr) >= start;
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
  const [authStore, catalogStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore()
  ]);

  const orders = Array.isArray(authStore.orders) ? authStore.orders : [];
  const products = Array.isArray(catalogStore.products) ? catalogStore.products : [];

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

  // Last 7 days order trend
  const now = new Date();
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const count = orders.filter((o) => {
      const t = new Date(o.createdAt);
      return t >= dayStart && t < dayEnd;
    }).length;
    const revenue = orders
      .filter((o) => {
        const t = new Date(o.createdAt);
        return (
          t >= dayStart &&
          t < dayEnd &&
          String(o.paymentStatus || "").toLowerCase() === "paid"
        );
      })
      .reduce((s, o) => s + Number(o.grandTotal || 0), 0);
    last7.push({ day: DAY_LABELS[d.getDay()], date: dayStart.toISOString(), count, revenue });
  }

  // Payment method breakdown (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
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
        orderId: o.orderId,
        orderNo: o.orderNo,
        customerName: name,
        customerCity: city,
        grandTotal: Number(o.grandTotal || 0),
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        manualPaymentStatus: o.manualPaymentStatus,
        shipmentStatus: o.shipmentStatus || o.fulfillmentStatus || "",
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
