const INDIA_GST_STATES = Object.freeze([
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" }
]);

const CODE_BY_NAME = new Map(
  INDIA_GST_STATES.map((row) => [row.name.trim().toUpperCase(), row.code])
);
const NAME_BY_CODE = new Map(INDIA_GST_STATES.map((row) => [row.code, row.name]));

// Historical GST data on this site sometimes has the state NAME sitting in the
// stateCode field (free-text forms let buyers type either) — this resolves either
// shape back to the canonical 2-digit code so tax-split logic never silently
// mismatches seller vs buyer state.
function resolveGstStateCode(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if (NAME_BY_CODE.has(value.padStart(2, "0"))) {
    return value.padStart(2, "0");
  }
  const byName = CODE_BY_NAME.get(value.toUpperCase());
  return byName || "";
}

function resolveGstStateName(rawCode) {
  return NAME_BY_CODE.get(String(rawCode || "").trim().padStart(2, "0")) || "";
}

module.exports = { INDIA_GST_STATES, resolveGstStateCode, resolveGstStateName };
