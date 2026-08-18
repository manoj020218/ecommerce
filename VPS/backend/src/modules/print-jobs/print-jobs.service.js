const { HttpError } = require("../../common/http-error");
const { readAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { readPrintStore, writePrintStore } = require("../../database/print-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { notifyCustomerEvent } = require("../marketing/marketing.service");
const { listUploadsByIds } = require("../print-uploads/print-uploads.service");
const { PRINT_JOB_STATUSES, jobKey } = require("./print-jobs.model");

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveCustomerName(order) {
  return (
    order.billingAddress?.name || order.shippingAddress?.name || "Customer"
  );
}

function resolveCustomerEmail(order) {
  return order.billingAddress?.email || order.shippingAddress?.email || "";
}

function resolveCustomerMobile(order) {
  return order.billingAddress?.mobile || order.shippingAddress?.mobile || "";
}

async function findJobStatus(printStore, orderId, lineId) {
  const key = jobKey(orderId, lineId);
  return ensureArray(printStore.printJobStatuses).find((row) => row.key === key) || null;
}

function buildJobRow(order, item, statusRecord) {
  return {
    key: jobKey(order.id, item.lineId),
    orderId: order.id,
    orderNo: order.orderNo || "",
    lineId: item.lineId || "",
    productId: item.productId,
    productTitle: item.title,
    customerName: resolveCustomerName(order),
    qty: Number(item.qty || 0),
    customization: ensureArray(item.customization),
    designUploadIds: ensureArray(item.designUploadIds),
    status: statusRecord?.status || PRINT_JOB_STATUSES.NEEDS_REVIEW,
    rejectionReason: statusRecord?.rejectionReason || "",
    moderatedAt: statusRecord?.moderatedAt || null,
    createdAt: order.createdAt
  };
}

// One row per order LINE (not per order) -- each custom-print line is its
// own uploaded design and needs its own review, regardless of how many
// other lines (custom-print or otherwise) share the same order.
async function listPrintJobs(filters = {}) {
  const [authStore, printStore] = await Promise.all([readAuthStore(), readPrintStore()]);

  const rows = [];
  for (const order of ensureArray(authStore.orders)) {
    if (order.paymentStatus !== "paid") continue;

    for (const item of ensureArray(order.items)) {
      if (!ensureArray(item.designUploadIds).length) continue;

      const statusRecord = await findJobStatus(printStore, order.id, item.lineId);
      rows.push(buildJobRow(order, item, statusRecord));
    }
  }

  let filtered = rows;
  if (filters.status) {
    filtered = filtered.filter((row) => row.status === filters.status);
  }

  return filtered.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
}

async function getPrintJob(orderId, lineId) {
  const [authStore, catalogStore, printStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPrintStore()
  ]);

  const order = ensureArray(authStore.orders).find((row) => row.id === orderId);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  const item = ensureArray(order.items).find((row) => row.lineId === lineId);
  if (!item) {
    throw new HttpError(404, "Print job not found on this order.");
  }

  const statusRecord = await findJobStatus(printStore, orderId, lineId);
  const job = buildJobRow(order, item, statusRecord);

  const product = ensureArray(catalogStore.products).find((row) => row.id === item.productId);
  const uploads = await listUploadsByIds(item.designUploadIds);

  // Resolve whichever safe-zone template the customer's selected choices
  // reference (e.g. the Fixing Type choice), so the admin sees the exact
  // same hole overlay the buyer saw at checkout.
  const templateId = job.customization.find((row) => row.safeZoneTemplateId)?.safeZoneTemplateId;
  const printTemplate = templateId
    ? ensureArray(product?.printTemplates).find((row) => row.id === templateId) || null
    : null;

  return {
    ...job,
    customerEmail: resolveCustomerEmail(order),
    customerMobile: resolveCustomerMobile(order),
    uploadSpec: product?.uploadSpec || {},
    printTemplate,
    uploads
  };
}

async function moderatePrintJob(orderId, lineId, payload, actor) {
  const [authStore, printStore] = await Promise.all([readAuthStore(), readPrintStore()]);
  const order = ensureArray(authStore.orders).find((row) => row.id === orderId);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  const item = ensureArray(order.items).find((row) => row.lineId === lineId);
  if (!item) {
    throw new HttpError(404, "Print job not found on this order.");
  }

  const key = jobKey(orderId, lineId);
  const now = new Date().toISOString();
  const nextStatus =
    payload.action === "reject" ? PRINT_JOB_STATUSES.REJECTED : PRINT_JOB_STATUSES.APPROVED;

  const existingIndex = ensureArray(printStore.printJobStatuses).findIndex(
    (row) => row.key === key
  );
  const record = {
    key,
    orderId,
    lineId,
    status: nextStatus,
    rejectionReason: payload.action === "reject" ? payload.rejectionReason || "" : "",
    moderatedAt: now,
    moderatedBy: actor.id
  };
  if (existingIndex >= 0) {
    printStore.printJobStatuses[existingIndex] = record;
  } else {
    printStore.printJobStatuses.push(record);
  }
  await writePrintStore(printStore);

  const customerEmail = resolveCustomerEmail(order);
  if (customerEmail) {
    await notifyCustomerEvent({
      eventKey: payload.action === "reject" ? "print_job_rejected" : "print_job_approved",
      toEmail: customerEmail,
      toMobile: resolveCustomerMobile(order),
      relatedResourceType: "order",
      relatedResourceId: order.id,
      variables: {
        customerName: resolveCustomerName(order),
        productName: item.title,
        orderNo: order.orderNo || "",
        rejectionReason: record.rejectionReason || "Did not meet our print-readiness requirements."
      }
    });
  }

  await addActivityLog({
    action: payload.action === "reject" ? "print_jobs.rejected" : "print_jobs.approved",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "print_job",
    resourceId: key
  });

  return buildJobRow(order, item, record);
}

module.exports = {
  listPrintJobs,
  getPrintJob,
  moderatePrintJob
};
