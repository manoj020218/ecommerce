const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const {
  readWebsiteLeadsStore,
  writeWebsiteLeadsStore
} = require("../../database/website-leads-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  cloneDefaultWebsiteLeadsStore,
  sanitizeWebsiteLead
} = require("./website-leads.model");

function ensureWebsiteLeadsStoreShape(store) {
  const defaults = cloneDefaultWebsiteLeadsStore();
  let changed = false;

  if (!Array.isArray(store.leads)) {
    store.leads = defaults.leads;
    changed = true;
  }

  return changed;
}

async function readNormalizedWebsiteLeadsStore() {
  const store = await readWebsiteLeadsStore();
  const changed = ensureWebsiteLeadsStoreShape(store);
  if (changed) {
    await writeWebsiteLeadsStore(store);
  }
  return store;
}

function buildSearchText(lead) {
  return [
    lead.name,
    lead.mobile,
    lead.email,
    lead.businessName,
    lead.businessType,
    lead.city,
    lead.currentWebsite,
    lead.message,
    lead.sourcePage,
    lead.status,
    lead.notes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function createWebsiteLead(payload) {
  const store = await readNormalizedWebsiteLeadsStore();
  const now = new Date().toISOString();

  const lead = {
    id: generateId("lead"),
    name: payload.name,
    mobile: payload.mobile,
    email: payload.email,
    businessName: payload.businessName,
    businessType: payload.businessType,
    city: payload.city,
    currentWebsite: payload.currentWebsite || "",
    monthlyOrders:
      payload.monthlyOrders === null || payload.monthlyOrders === undefined
        ? null
        : Number(payload.monthlyOrders),
    productCount:
      payload.productCount === null || payload.productCount === undefined
        ? null
        : Number(payload.productCount),
    message: payload.message,
    sourcePage: payload.sourcePage,
    status: "new",
    notes: "",
    createdAt: now,
    updatedAt: now
  };

  store.leads.push(lead);
  await writeWebsiteLeadsStore(store);

  await addActivityLog({
    action: "website_leads.created",
    actorId: "public_website",
    actorRole: "public",
    resourceType: "website_lead",
    resourceId: lead.id,
    metadata: {
      sourcePage: lead.sourcePage,
      businessType: lead.businessType,
      city: lead.city
    }
  });

  return sanitizeWebsiteLead(lead);
}

async function listAdminWebsiteLeads(filters) {
  const store = await readNormalizedWebsiteLeadsStore();
  let rows = [...store.leads];

  if (filters.status) {
    rows = rows.filter((lead) => lead.status === filters.status);
  }

  if (filters.q) {
    const query = filters.q.toLowerCase();
    rows = rows.filter((lead) => buildSearchText(lead).includes(query));
  }

  return rows
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, filters.limit)
    .map(sanitizeWebsiteLead);
}

async function updateWebsiteLead(leadId, patch, actor) {
  const store = await readNormalizedWebsiteLeadsStore();
  const index = store.leads.findIndex((lead) => lead.id === leadId);
  if (index < 0) {
    throw new HttpError(404, "Website lead not found.");
  }

  const current = store.leads[index];
  const next = {
    ...current,
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.notes === undefined ? {} : { notes: patch.notes }),
    updatedAt: new Date().toISOString()
  };

  store.leads[index] = next;
  await writeWebsiteLeadsStore(store);

  await addActivityLog({
    action: "website_leads.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "website_lead",
    resourceId: next.id,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeWebsiteLead(next);
}

module.exports = {
  createWebsiteLead,
  listAdminWebsiteLeads,
  updateWebsiteLead
};
