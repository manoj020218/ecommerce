const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { resolveGstStateName } = require("../../common/india-gst-states");
const { readAuthStore, writeAuthStore, withAuthStoreLock } = require("../../database/auth-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { getAllSettings } = require("../settings/settings.service");
const { ensureCustomerAccountShape } = require("../customer-account/customer-account.model");
const { mobileDigits, sanitizeDealerProfile, nextDealerCode } = require("./dealers.model");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function findUserByIdentity(users, { mobile, email }) {
  const m = mobileDigits(mobile);
  const e = String(email || "").trim().toLowerCase();
  return ensureArray(users).find((u) =>
    (m.length >= 8 && mobileDigits(u.mobile) === m) || (e && String(u.email || "").trim().toLowerCase() === e)
  ) || null;
}

function buildAddress(payload) {
  return {
    addressLine1: payload.addressLine1 || "",
    addressLine2: payload.addressLine2 || "",
    city: payload.city || "",
    state: resolveGstStateName(payload.stateCode) || "",
    stateCode: payload.stateCode || "",
    pincode: payload.pincode || ""
  };
}

function toSavedAddress(payload, address, isDefault) {
  return {
    id: generateId("addr"),
    label: "Dealer (registered)",
    name: payload.contactName,
    mobile: String(payload.mobile || "").trim(),
    email: payload.email || "",
    ...address,
    country: "India",
    isDefaultBilling: isDefault,
    isDefaultShipping: isDefault
  };
}

// ─── order stats (calendar month + Indian financial year, IST) ─────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istParts(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

function financialYearStart(parts) {
  return parts.m >= 4 ? parts.y : parts.y - 1;
}

function orderBelongsTo(order, customer) {
  if (order.userId) return order.userId === customer.id;
  const m = mobileDigits(customer.mobile);
  const e = String(customer.email || "").trim().toLowerCase();
  const om = mobileDigits(order.billingAddress?.mobile || order.shippingAddress?.mobile);
  const oe = String(order.billingAddress?.email || order.shippingAddress?.email || "").trim().toLowerCase();
  return (m.length >= 8 && m === om) || (Boolean(e) && e === oe);
}

function isCountableOrder(order) {
  return !["cancelled", "rejected"].includes(String(order.orderStatus || "").toLowerCase());
}

function buildOrderStats(orders, customer) {
  const now = istParts(nowIso());
  const fy = financialYearStart(now);
  const stats = { monthCount: 0, monthValue: 0, fyCount: 0, fyValue: 0, totalCount: 0, totalValue: 0, lastOrderAt: null };
  for (const order of orders) {
    if (!isCountableOrder(order) || !orderBelongsTo(order, customer)) continue;
    const at = order.orderDate || order.createdAt;
    const p = istParts(at);
    const value = Number(order.grandTotal || 0);
    stats.totalCount += 1;
    stats.totalValue += value;
    if (p && financialYearStart(p) === fy) { stats.fyCount += 1; stats.fyValue += value; }
    if (p && p.y === now.y && p.m === now.m) { stats.monthCount += 1; stats.monthValue += value; }
    if (!stats.lastOrderAt || Date.parse(at) > Date.parse(stats.lastOrderAt)) stats.lastOrderAt = at;
  }
  for (const k of ["monthValue", "fyValue", "totalValue"]) stats[k] = Math.round(stats[k] * 100) / 100;
  return stats;
}

function sanitizeDealerRow(user, orders) {
  return {
    customerId: user.id,
    customerCode: user.customerCode || "",
    name: user.name || "",
    mobile: user.mobile || "",
    email: user.email || "",
    dealer: sanitizeDealerProfile(user.dealer),
    stats: buildOrderStats(orders, user)
  };
}

// ─── notifications (best-effort, never block the registration) ─────────────
function buildDetails(user) {
  const d = sanitizeDealerProfile(user.dealer);
  const rows = [
    ["Dealer code", d.code],
    ["Firm", d.firmName],
    ["Contact", d.contactName],
    ["Mobile", d.mobile],
    ["Alternate mobile", d.alternateMobile],
    ["Email", d.email],
    ["GSTIN", d.gstin || "Not registered"],
    ["Business type", d.businessType],
    ["Address", [d.address.addressLine1, d.address.addressLine2, d.address.city, d.address.state, d.address.pincode].filter(Boolean).join(", ")]
  ].filter(([, v]) => v);
  return {
    html: `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:8px 0 14px;">${rows
      .map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;width:40%;">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;">${escapeHtml(v)}</td></tr>`)
      .join("")}</table>`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n")
  };
}

async function notifyRegistration(user) {
  try {
    const { safeSendTemplateNotification } = require("../marketing/marketing.service");
    const settings = await getAllSettings();
    const profile = settings.storeProfile || {};
    const d = sanitizeDealerProfile(user.dealer);
    const details = buildDetails(user);
    const variables = {
      customerName: d.contactName,
      customerMobile: d.mobile,
      customerEmail: d.email,
      productName: d.firmName,
      dealerCode: d.code,
      itemsTable: details.html,
      cartItems: details.text
    };
    const base = { relatedResourceType: "dealer", relatedResourceId: user.id, variables };
    // Sequential: each send appends to the same notification log file.
    if (profile.supportEmail) await safeSendTemplateNotification({ ...base, templateKey: "dealer_registered_admin", toEmail: profile.supportEmail });
    const adminMobile = profile.supportWhatsApp || profile.supportMobile;
    if (adminMobile) await safeSendTemplateNotification({ ...base, templateKey: "dealer_registered_admin_whatsapp", toMobile: adminMobile });
    if (d.email) await safeSendTemplateNotification({ ...base, templateKey: "dealer_registered", toEmail: d.email });
    if (d.mobile) await safeSendTemplateNotification({ ...base, templateKey: "dealer_registered_whatsapp", toMobile: d.mobile });
  } catch (_error) {
    // best-effort
  }
}

// ─── public ────────────────────────────────────────────────────────────────
async function registerDealer(payload) {
  const result = await withAuthStoreLock(async () => {
    const store = await readAuthStore();
    if (!Array.isArray(store.users)) store.users = [];
    const now = nowIso();
    const address = buildAddress(payload);
    let user = findUserByIdentity(store.users, payload);

    if (user?.dealer?.code) {
      return { user, code: user.dealer.code, alreadyRegistered: true };
    }

    const code = nextDealerCode(store.users, payload.stateCode);
    if (!code) throw new HttpError(409, "Dealer registration for this state is full — please contact us.");

    if (user) {
      // Existing customer (matched by mobile/email): only fill in what's empty,
      // never overwrite details they or the admin already entered.
      ensureCustomerAccountShape(user);
      if (!user.name || user.name === "Guest Customer") user.name = payload.contactName;
      if (!user.companyName) user.companyName = payload.firmName;
      if (!user.email && payload.email && !findUserByIdentity(store.users, { email: payload.email })) user.email = payload.email;
      if (!user.gstin && payload.gstin) {
        user.gstin = payload.gstin;
        user.gstDetails = { ...(user.gstDetails || {}), gstin: payload.gstin, businessName: user.gstDetails?.businessName || payload.firmName, contactName: user.gstDetails?.contactName || payload.contactName };
      }
      const hasAddresses = ensureArray(user.savedAddresses).length > 0;
      user.savedAddresses = [...ensureArray(user.savedAddresses), toSavedAddress(payload, address, !hasAddresses)];
    } else {
      // New customer — same shape as a walk-in customer, retail pricing.
      user = {
        id: generateId("user"),
        name: payload.contactName,
        email: payload.email || "",
        mobile: String(payload.mobile).trim(),
        verifiedEmail: false,
        verifiedMobile: false,
        passwordHash: null,
        authProviders: [],
        companyName: payload.firmName,
        customerType: "retail",
        priceGroup: "",
        isB2BApproved: false,
        creditAllowed: false,
        bankTransferOnly: false,
        pickupAllowed: true,
        orderMode: "online",
        gstin: payload.gstin || "",
        gstDetails: { gstin: payload.gstin || "", businessName: payload.firmName, contactName: payload.contactName },
        savedAddresses: [toSavedAddress(payload, address, true)],
        savedProductIds: [],
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null
      };
      ensureCustomerAccountShape(user);
      store.users.push(user);
    }

    if (payload.promotionsConsent) user.newsletterSubscribed = true;
    user.dealer = {
      code,
      status: "pending",
      firmName: payload.firmName,
      contactName: payload.contactName,
      businessType: payload.businessType || "",
      gstin: payload.gstin || "",
      mobile: String(payload.mobile).trim(),
      alternateMobile: payload.alternateMobile || "",
      email: payload.email || "",
      address,
      promotionsConsent: Boolean(payload.promotionsConsent),
      notes: "",
      registeredAt: now,
      verifiedAt: null,
      updatedAt: now
    };
    user.updatedAt = now;
    await writeAuthStore(store);
    return { user, code, alreadyRegistered: false };
  });

  if (!result.alreadyRegistered) {
    await notifyRegistration(result.user);
    try {
      await addActivityLog({ action: "dealers.registered", actorId: result.user.id, actorRole: "customer", resourceType: "customer", resourceId: result.user.id, metadata: { dealerCode: result.code } });
    } catch (_e) { /* best-effort */ }
  }
  return {
    dealerCode: result.code,
    firmName: result.user.dealer?.firmName || "",
    alreadyRegistered: result.alreadyRegistered
  };
}

// ─── admin ─────────────────────────────────────────────────────────────────
async function listDealers(filters = {}) {
  const store = await readAuthStore();
  const orders = ensureArray(store.orders);
  const q = String(filters.q || "").trim().toLowerCase();
  return ensureArray(store.users)
    .filter((u) => u.dealer?.code)
    .filter((u) => !filters.status || (u.dealer.status || "pending") === filters.status)
    .filter((u) => !filters.stateCode || u.dealer.code.startsWith(filters.stateCode))
    .filter((u) => !q || [u.dealer.code, u.dealer.firmName, u.dealer.contactName, u.dealer.gstin, u.mobile, u.email, u.dealer.address?.city]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
    .map((u) => sanitizeDealerRow(u, orders))
    .sort((a, b) => a.dealer.code.localeCompare(b.dealer.code));
}

async function getDealer(customerId) {
  const store = await readAuthStore();
  const user = ensureArray(store.users).find((u) => u.id === customerId && u.dealer?.code);
  if (!user) throw new HttpError(404, "Dealer not found.");
  const orders = ensureArray(store.orders);
  const mine = orders.filter((o) => isCountableOrder(o) && orderBelongsTo(o, user));
  // last 12 months, IST
  const now = istParts(nowIso());
  const months = [];
  for (let i = 11; i >= 0; i -= 1) {
    const idx = now.y * 12 + (now.m - 1) - i;
    months.push({ key: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`, count: 0, value: 0 });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const o of mine) {
    const p = istParts(o.orderDate || o.createdAt);
    const row = p && byKey.get(`${p.y}-${String(p.m).padStart(2, "0")}`);
    if (row) { row.count += 1; row.value = Math.round((row.value + Number(o.grandTotal || 0)) * 100) / 100; }
  }
  const recentOrders = mine
    .sort((a, b) => Date.parse(b.orderDate || b.createdAt || 0) - Date.parse(a.orderDate || a.createdAt || 0))
    .slice(0, 20)
    .map((o) => ({ id: o.id, orderNo: o.orderNo || "", date: o.orderDate || o.createdAt || null, grandTotal: Number(o.grandTotal || 0), orderStatus: o.orderStatus || "", paymentStatus: o.paymentStatus || "" }));
  return { ...sanitizeDealerRow(user, orders), months, recentOrders };
}

async function updateDealer(customerId, patch, actor) {
  const updated = await withAuthStoreLock(async () => {
    const store = await readAuthStore();
    const user = ensureArray(store.users).find((u) => u.id === customerId && u.dealer?.code);
    if (!user) throw new HttpError(404, "Dealer not found.");
    const d = user.dealer;
    const now = nowIso();
    if (patch.status !== undefined && patch.status !== d.status) {
      d.status = patch.status;
      d.verifiedAt = patch.status === "verified" ? now : null;
    }
    for (const key of ["notes", "firmName", "contactName", "alternateMobile", "gstin", "businessType", "promotionsConsent"]) {
      if (patch[key] !== undefined) d[key] = patch[key];
    }
    for (const key of ["addressLine1", "addressLine2", "city", "pincode"]) {
      if (patch[key] !== undefined) d.address = { ...(d.address || {}), [key]: patch[key] };
    }
    if (patch.promotionsConsent === true) user.newsletterSubscribed = true;
    // Admin corrections flow to the customer record used by Walk-in Orders / invoices.
    if (patch.firmName !== undefined) user.companyName = patch.firmName;
    if (patch.gstin !== undefined) {
      user.gstin = patch.gstin;
      user.gstDetails = { ...(user.gstDetails || {}), gstin: patch.gstin };
    }
    const addressKeys = ["addressLine1", "addressLine2", "city", "pincode"].filter((k) => patch[k] !== undefined);
    if (addressKeys.length || patch.contactName !== undefined) {
      user.savedAddresses = ensureArray(user.savedAddresses).map((a) => {
        if (a.label !== "Dealer (registered)") return a;
        const next = { ...a };
        for (const k of addressKeys) next[k] = patch[k];
        if (patch.contactName !== undefined) next.name = patch.contactName;
        return next;
      });
    }
    d.updatedAt = now;
    user.updatedAt = now;
    await writeAuthStore(store);
    return user;
  });
  try {
    await addActivityLog({ action: "dealers.updated", actorId: actor?.id, actorRole: actor?.role, resourceType: "customer", resourceId: customerId, metadata: { changedFields: Object.keys(patch) } });
  } catch (_e) { /* best-effort */ }
  const store = await readAuthStore();
  return sanitizeDealerRow(updated, ensureArray(store.orders));
}

module.exports = { registerDealer, listDealers, getDealer, updateDealer };
