// App push notifications (2026-10-03).
// - Phones subscribe from the storefront (My Account / installed app).
// - Order updates: pushForEvent() is called from marketing.notifyCustomerEvent,
//   so every order message that already goes by email/WhatsApp also arrives
//   as a phone notification for a logged-in buyer who allowed notifications.
// - Offers / new products: admin "App Notifications" page → broadcast().
// Free: web push goes straight to Google / Apple / Mozilla push services
// using the server's own VAPID keys (made once, kept in push-store.json).

const crypto = require("node:crypto");
const webpush = require("web-push");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readPushStore, updatePushStore } = require("../../database/push-store");
const { readAuthStore } = require("../../database/auth-store");
const { getAllSettings } = require("../settings/settings.service");

const MAX_SUBSCRIPTIONS_PER_CUSTOMER = 10;
const MAX_NOTIFICATIONS_KEPT = 3000;
const SEND_CONCURRENCY = 8;

let cachedVapid = null;

async function getVapid() {
  if (cachedVapid) return cachedVapid;
  cachedVapid = await updatePushStore((store) => {
    if (!store.vapid?.publicKey || !store.vapid?.privateKey) {
      const keys = webpush.generateVAPIDKeys();
      store.vapid = { ...keys, createdAt: new Date().toISOString() };
    }
    return store.vapid;
  });
  return cachedVapid;
}

async function getPublicKey() {
  return { publicKey: (await getVapid()).publicKey };
}

function cleanText(value, max) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "/";
  if (url.startsWith("/") && !url.startsWith("//")) return url.slice(0, 500);
  if (/^https:\/\/(www\.)?jenixindia\.com(\/|$)/i.test(url)) return url.slice(0, 500);
  return "/";
}

function cleanImage(value) {
  const url = String(value || "").trim();
  return /^https:\/\/\S+$/i.test(url) ? url.slice(0, 500) : "";
}

// ─── subscriptions ─────────────────────────────────────────────────────────
function validateSubscription(sub) {
  const endpoint = String(sub?.endpoint || "");
  const p256dh = String(sub?.keys?.p256dh || "");
  const auth = String(sub?.keys?.auth || "");
  if (!/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    throw new HttpError(400, "Invalid push subscription.");
  }
  return { endpoint, keys: { p256dh, auth } };
}

async function subscribe(customerId, subscription, userAgent = "") {
  const sub = validateSubscription(subscription);
  const now = new Date().toISOString();
  await updatePushStore((store) => {
    const existing = store.subscriptions.find((row) => row.endpoint === sub.endpoint);
    if (existing) {
      Object.assign(existing, { keys: sub.keys, customerId, userAgent: cleanText(userAgent, 200), updatedAt: now });
    } else {
      store.subscriptions.push({ id: generateId("pushsub"), endpoint: sub.endpoint, keys: sub.keys, customerId, userAgent: cleanText(userAgent, 200), createdAt: now, updatedAt: now });
    }
    // keep only the latest few phones per customer
    const mine = store.subscriptions.filter((row) => row.customerId === customerId).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const drop = new Set(mine.slice(MAX_SUBSCRIPTIONS_PER_CUSTOMER).map((row) => row.endpoint));
    if (drop.size) store.subscriptions = store.subscriptions.filter((row) => !drop.has(row.endpoint));
  });
  return { subscribed: true };
}

async function unsubscribe(customerId, endpoint) {
  await updatePushStore((store) => {
    store.subscriptions = store.subscriptions.filter((row) => !(row.endpoint === endpoint && row.customerId === customerId));
  });
  return { subscribed: false };
}

// ─── sending ───────────────────────────────────────────────────────────────
async function sendToSubscriptions(subs, payload) {
  if (!subs.length) return { sent: 0, failed: 0, removed: 0 };
  const vapid = await getVapid();
  const settings = await getAllSettings().catch(() => ({}));
  const contact = settings?.storeProfile?.supportEmail || "support@jenixindia.com";
  const options = {
    TTL: 3 * 24 * 60 * 60,
    vapidDetails: { subject: `mailto:${contact}`, publicKey: vapid.publicKey, privateKey: vapid.privateKey }
  };
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const dead = new Set();
  for (let i = 0; i < subs.length; i += SEND_CONCURRENCY) {
    await Promise.all(
      subs.slice(i, i + SEND_CONCURRENCY).map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, options);
          sent += 1;
        } catch (error) {
          failed += 1;
          if (error?.statusCode === 404 || error?.statusCode === 410) dead.add(sub.endpoint);
        }
      })
    );
  }
  if (dead.size) {
    await updatePushStore((store) => {
      store.subscriptions = store.subscriptions.filter((row) => !dead.has(row.endpoint));
    });
  }
  return { sent, failed, removed: dead.size };
}

function buildPayload({ title, body, url, image, tag }) {
  return {
    title: cleanText(title, 80) || "Jenix India",
    body: cleanText(body, 240),
    url: cleanUrl(url),
    image: cleanImage(image),
    tag: tag || crypto.randomBytes(4).toString("hex")
  };
}

async function recordNotification(entry) {
  await updatePushStore((store) => {
    store.notifications.push(entry);
    if (store.notifications.length > MAX_NOTIFICATIONS_KEPT) {
      store.notifications = store.notifications.slice(-MAX_NOTIFICATIONS_KEPT);
    }
  });
}

async function notifyCustomer(customerId, message, type = "order") {
  if (!customerId) return { sent: 0, failed: 0, removed: 0 };
  const payload = buildPayload(message);
  const store = await readPushStore();
  const subs = store.subscriptions.filter((row) => row.customerId === customerId);
  const result = await sendToSubscriptions(subs, payload);
  await recordNotification({ id: generateId("notif"), customerId, type, ...payload, createdAt: new Date().toISOString(), ...result });
  return result;
}

// ─── order events → push ───────────────────────────────────────────────────
const EVENT_MESSAGES = {
  order_placed: (v) => ["Order placed ✅", `Thank you! Order ${v.orderNo} is confirmed. We'll update you at every step.`],
  walkin_payment_confirmed: (v) => ["Payment received ✅", `We've received ${v.orderTotal || "your payment"} for order ${v.orderNo}.`],
  manual_payment_verified: (v) => ["Payment confirmed ✅", `Payment for order ${v.orderNo} is confirmed.`],
  order_processing: (v) => ["Order in process", `We're preparing order ${v.orderNo}.`],
  order_packed: (v) => ["Order packed 📦", `Order ${v.orderNo} is packed and will ship soon.`],
  tracking_detail_update: (v) => ["Shipped 🚚", `Order ${v.orderNo} is on its way${v.courierName ? ` via ${v.courierName}` : ""}. Tap to track.`],
  order_dispatched: (v) => ["Shipped 🚚", `Order ${v.orderNo} has been shipped.`],
  ready_for_pickup: (v) => ["Ready for pickup 🛍️", `Order ${v.orderNo} is ready to collect${v.pickupTimings ? ` (${v.pickupTimings})` : ""}.`],
  order_delivered: (v) => ["Delivered ✅", `Order ${v.orderNo} has been delivered. Thank you!`],
  self_pickup_completed: (v) => ["Thank you 🙏", `Thanks for collecting order ${v.orderNo}.`]
};

async function resolveOrderForEvent(relatedResourceType, relatedResourceId) {
  const authStore = await readAuthStore();
  if (relatedResourceType === "order") {
    return (authStore.orders || []).find((o) => o.id === relatedResourceId) || null;
  }
  if (relatedResourceType === "shipment") {
    const { readShippingStore } = require("../../database/shipping-store");
    const shipping = await readShippingStore();
    const shipment = (shipping.shipments || []).find((s) => s.id === relatedResourceId);
    return shipment ? (authStore.orders || []).find((o) => o.id === shipment.orderId) || null : null;
  }
  return null;
}

// Best-effort; never throws (called without await from notifyCustomerEvent).
async function pushForEvent({ eventKey, variables = {}, relatedResourceType, relatedResourceId }) {
  try {
    const build = EVENT_MESSAGES[eventKey];
    if (!build) return null;
    const order = await resolveOrderForEvent(relatedResourceType, relatedResourceId);
    if (!order?.userId) return null;
    const [title, body] = build({ ...variables, orderNo: variables.orderNo || order.orderNo || "" });
    return await notifyCustomer(order.userId, { title, body, url: `/account/orders/${order.id}`, tag: `order-${order.id}` }, "order");
  } catch (_error) {
    return null;
  }
}

// ─── admin broadcast (offers / new products) ───────────────────────────────
const AUDIENCES = ["all", "customers_with_orders", "dealers"];

async function audienceSubscriptions(audience) {
  const store = await readPushStore();
  if (audience === "all") return store.subscriptions;
  const authStore = await readAuthStore();
  let customerIds;
  if (audience === "dealers") {
    customerIds = new Set((authStore.users || []).filter((u) => u.dealer?.code).map((u) => u.id));
  } else {
    customerIds = new Set((authStore.orders || []).map((o) => o.userId).filter(Boolean));
  }
  return store.subscriptions.filter((row) => customerIds.has(row.customerId));
}

async function broadcast(input, actor) {
  const audience = AUDIENCES.includes(input.audience) ? input.audience : "all";
  const payload = buildPayload({ ...input, tag: `offer-${Date.now()}` });
  if (!payload.body) throw new HttpError(400, "Please write the message.");
  const subs = await audienceSubscriptions(audience);
  const result = await sendToSubscriptions(subs, payload);
  const entry = { id: generateId("notif"), customerId: null, type: "offer", audience, ...payload, createdAt: new Date().toISOString(), createdBy: actor?.id || "", phones: subs.length, ...result };
  await recordNotification(entry);
  return entry;
}

async function adminSummary() {
  const store = await readPushStore();
  const customers = new Set(store.subscriptions.map((row) => row.customerId).filter(Boolean));
  const counts = {};
  for (const audience of AUDIENCES) counts[audience] = (await audienceSubscriptions(audience)).length;
  const history = store.notifications.filter((row) => row.type === "offer").slice(-30).reverse();
  const last7 = history.filter((row) => Date.now() - Date.parse(row.createdAt) < 7 * 24 * 60 * 60 * 1000).length;
  return { phones: store.subscriptions.length, customers: customers.size, audienceCounts: counts, sentLast7Days: last7, history };
}

// My Account → Notifications: own order updates + offers sent to everyone
// (or to a group this customer is in).
async function listCustomerNotifications(customerId) {
  const store = await readPushStore();
  const authStore = await readAuthStore();
  const user = (authStore.users || []).find((u) => u.id === customerId);
  const hasOrders = (authStore.orders || []).some((o) => o.userId === customerId);
  const isDealer = Boolean(user?.dealer?.code);
  const since = Date.parse(user?.createdAt || 0) - 24 * 60 * 60 * 1000;
  return store.notifications
    .filter((row) =>
      row.customerId === customerId ||
      (row.type === "offer" && Date.parse(row.createdAt) >= since &&
        (row.audience === "all" || (row.audience === "customers_with_orders" && hasOrders) || (row.audience === "dealers" && isDealer))))
    .slice(-50)
    .reverse()
    .map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, url: row.url, image: row.image, createdAt: row.createdAt }));
}

async function customerPushStatus(customerId) {
  const store = await readPushStore();
  return { phones: store.subscriptions.filter((row) => row.customerId === customerId).length };
}

module.exports = {
  AUDIENCES,
  getPublicKey,
  subscribe,
  unsubscribe,
  notifyCustomer,
  pushForEvent,
  broadcast,
  adminSummary,
  listCustomerNotifications,
  customerPushStatus
};
