const COMMISSION_STATUSES = Object.freeze({
  PENDING: "pending",
  PAID: "paid"
});

function cloneDefaultPartnerStore() {
  return { partners: [], commissionLedger: [] };
}

// Admin list/detail views need the apiKey to show/copy the feed URL, but the
// public resolve endpoint (used by any visitor landing with ?ref=) must
// never leak it — two shaping functions, not one, so a future admin-page
// change can't accidentally widen what the public endpoint returns.
function sanitizePartner(partner) {
  return { ...partner };
}

function toPublicPartner(partner) {
  return {
    code: partner.code,
    name: partner.name,
    returnUrl: partner.returnUrl || ""
  };
}

function sanitizeCommissionLedgerEntry(entry) {
  return { ...entry };
}

module.exports = {
  COMMISSION_STATUSES,
  cloneDefaultPartnerStore,
  sanitizePartner,
  toPublicPartner,
  sanitizeCommissionLedgerEntry
};
