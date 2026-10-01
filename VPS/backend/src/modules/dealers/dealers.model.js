// Dealer registration (2026-10-01). A dealer is a normal customer record
// (auth-store users) with a `dealer` profile attached, so Walk-in Orders
// finds them with their firm, GST and address already filled in.
// Registration NEVER changes pricing: dealers are priced per order like any
// walk-in customer. "Verified" only marks the dealer as checked by admin.
// Dealer code = 2-digit GST state code + 3-digit running number in that
// state, e.g. 08001 = first dealer in Rajasthan.

const DEALER_STATUSES = Object.freeze(["pending", "verified", "rejected"]);

const BUSINESS_TYPES = Object.freeze([
  "Dealer / Retailer",
  "Distributor / Stockist",
  "System Integrator / Installer",
  "Electrician / Contractor",
  "Builder / Developer",
  "Other"
]);

function str(value) {
  return typeof value === "string" ? value : "";
}

function mobileDigits(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function sanitizeDealerProfile(dealer) {
  const d = dealer || {};
  const a = d.address || {};
  return {
    code: str(d.code),
    status: DEALER_STATUSES.includes(d.status) ? d.status : "pending",
    firmName: str(d.firmName),
    contactName: str(d.contactName),
    businessType: str(d.businessType),
    gstin: str(d.gstin),
    mobile: str(d.mobile),
    alternateMobile: str(d.alternateMobile),
    email: str(d.email),
    address: {
      addressLine1: str(a.addressLine1),
      addressLine2: str(a.addressLine2),
      city: str(a.city),
      state: str(a.state),
      stateCode: str(a.stateCode),
      pincode: str(a.pincode)
    },
    promotionsConsent: Boolean(d.promotionsConsent),
    notes: str(d.notes),
    registeredAt: d.registeredAt || null,
    verifiedAt: d.verifiedAt || null,
    updatedAt: d.updatedAt || null
  };
}

// Next free code for a state: highest existing number in that state + 1.
function nextDealerCode(users, stateCode) {
  let max = 0;
  for (const user of users || []) {
    const code = user?.dealer?.code || "";
    if (code.length === 5 && code.startsWith(stateCode)) {
      max = Math.max(max, Number(code.slice(2)) || 0);
    }
  }
  if (max >= 999) return null;
  return `${stateCode}${String(max + 1).padStart(3, "0")}`;
}

module.exports = {
  DEALER_STATUSES,
  BUSINESS_TYPES,
  mobileDigits,
  sanitizeDealerProfile,
  nextDealerCode
};
