const WEBSITE_LEAD_STATUSES = Object.freeze([
  "new",
  "contacted",
  "demo_scheduled",
  "proposal_sent",
  "converted",
  "not_interested",
  "closed"
]);

function cloneDefaultWebsiteLeadsStore() {
  return {
    leads: []
  };
}

function sanitizeWebsiteLead(lead) {
  return {
    id: lead.id,
    name: lead.name,
    mobile: lead.mobile,
    email: lead.email,
    businessName: lead.businessName,
    businessType: lead.businessType,
    city: lead.city,
    currentWebsite: lead.currentWebsite || "",
    monthlyOrders:
      lead.monthlyOrders === null || lead.monthlyOrders === undefined
        ? null
        : Number(lead.monthlyOrders),
    productCount:
      lead.productCount === null || lead.productCount === undefined
        ? null
        : Number(lead.productCount),
    message: lead.message,
    sourcePage: lead.sourcePage,
    status: lead.status,
    notes: lead.notes || "",
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

module.exports = {
  WEBSITE_LEAD_STATUSES,
  cloneDefaultWebsiteLeadsStore,
  sanitizeWebsiteLead
};
