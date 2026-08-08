const { HttpError } = require("../../common/http-error");
const {
  SHIPPING_METHODS,
  SHIPPING_ZONES,
  SHIPPING_ZONE_LABELS
} = require("./shipping.model");

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function toUpperCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

// Buyer-submitted stateCode can be a 2-letter abbreviation ("RJ", "KA") or a
// GST numeric code ("08", "29") — confirmed live that the storefront's
// address form actually submits the numeric GST code. zoneStateMap,
// localPincodePrefixes matching, and originStateCode are all keyed by
// 2-letter abbreviation, so a numeric code never matched anything and every
// such order silently fell through to the "All India" zone regardless of
// the buyer's real location — reproduced against a live order before this
// fix. Only the states actually used in zoneStateMap need mapping; unlisted
// ones intentionally fall through to All India either way.
const GST_CODE_TO_STATE_ABBR = {
  "01": "JK", "02": "HP", "03": "PB", "04": "CH", "05": "UK", "06": "HR",
  "07": "DL", "08": "RJ", "09": "UP", "10": "BR", "11": "SK", "12": "AR",
  "13": "NL", "14": "MN", "15": "MZ", "16": "TR", "17": "ML", "18": "AS",
  "19": "WB", "20": "JH", "21": "OD", "22": "CG", "23": "MP", "24": "GJ",
  "26": "DN", "27": "MH", "29": "KA", "30": "GA", "31": "LD", "32": "KL",
  "33": "TN", "34": "PY", "35": "AN", "36": "TS", "37": "AP", "38": "LA",
  "97": "OT"
};

function normalizeStateCode(rawValue) {
  const value = toUpperCode(rawValue);
  if (!value) return "";
  if (/^\d+$/.test(value)) {
    return GST_CODE_TO_STATE_ABBR[value.padStart(2, "0")] || value;
  }
  return value;
}

function normalizePincode(value) {
  return String(value || "")
    .trim()
    .replace(/[^0-9]/g, "")
    .slice(0, 6);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveDestinationZone(destination, settings) {
  const pincode = normalizePincode(destination?.pincode);
  const stateCode = normalizeStateCode(destination?.stateCode || destination?.state);
  const originStateCode = normalizeStateCode(settings.originStateCode || "");

  const localPrefixes = safeArray(settings.localPincodePrefixes).map((value) =>
    String(value || "").trim()
  );
  const remotePrefixes = safeArray(settings.remotePincodePrefixes).map((value) =>
    String(value || "").trim()
  );

  if (
    pincode &&
    localPrefixes.some((prefix) => prefix && pincode.startsWith(prefix))
  ) {
    return SHIPPING_ZONES.LOCAL;
  }

  if (stateCode && originStateCode && stateCode === originStateCode) {
    return SHIPPING_ZONES.STATE;
  }

  if (
    pincode &&
    remotePrefixes.some((prefix) => prefix && pincode.startsWith(prefix))
  ) {
    return SHIPPING_ZONES.NORTH_EAST_REMOTE;
  }

  const zoneStateMap = settings.zoneStateMap || {};
  const northEastStates = new Set(
    safeArray(zoneStateMap.north_east_remote).map((code) => toUpperCode(code))
  );
  if (stateCode && northEastStates.has(stateCode)) {
    return SHIPPING_ZONES.NORTH_EAST_REMOTE;
  }

  const northStates = new Set(
    safeArray(zoneStateMap.north_india).map((code) => toUpperCode(code))
  );
  if (stateCode && northStates.has(stateCode)) {
    return SHIPPING_ZONES.NORTH_INDIA;
  }

  const westStates = new Set(
    safeArray(zoneStateMap.west_india).map((code) => toUpperCode(code))
  );
  if (stateCode && westStates.has(stateCode)) {
    return SHIPPING_ZONES.WEST_INDIA;
  }

  const southStates = new Set(
    safeArray(zoneStateMap.south_india).map((code) => toUpperCode(code))
  );
  if (stateCode && southStates.has(stateCode)) {
    return SHIPPING_ZONES.SOUTH_INDIA;
  }

  return SHIPPING_ZONES.ALL_INDIA;
}

function billableUnitWeightKg(line) {
  const deadWeightKg = Number(line.deadWeightKg || 0);
  const lengthCm = Number(line.lengthCm || 0);
  const widthCm = Number(line.widthCm || 0);
  const heightCm = Number(line.heightCm || 0);

  const volumetricWeightKg =
    lengthCm > 0 && widthCm > 0 && heightCm > 0
      ? (lengthCm * widthCm * heightCm) / 5000
      : 0;

  return Math.max(0.2, deadWeightKg, volumetricWeightKg);
}

function resolveBillableWeightKg(lines) {
  let totalWeightKg = 0;

  for (const line of safeArray(lines)) {
    const qty = Number(line.qty || 0);
    if (qty <= 0) {
      continue;
    }
    totalWeightKg += billableUnitWeightKg(line) * qty;
  }

  return roundMoney(totalWeightKg);
}

// Indian courier companies don't bill continuous fractional weight — a
// parcel at 1.1kg is billed the same as one at 2.0kg, because the actual
// (or volumetric) weight is rounded UP to the next whole kg before the
// slab rate applies. Math.ceil alone would treat 1.9999999997 (float
// rounding noise from the volumetric-weight division) as 2kg when it's
// really 2kg exactly, so the tiny epsilon subtraction guards against that.
function roundUpToWholeKg(weightKg) {
  return Math.max(1, Math.ceil(Number(weightKg || 0) - 1e-9));
}

function calculateWeightSlabCharge(weightKg, shippingClass) {
  const roundedKg = roundUpToWholeKg(weightKg);
  const slabs = safeArray(shippingClass.weightSlabs)
    .map((slab) => ({ uptoKg: Number(slab.uptoKg || 0), charge: Number(slab.charge || 0) }))
    .filter((slab) => slab.uptoKg > 0)
    .sort((a, b) => a.uptoKg - b.uptoKg);

  const matchedSlab = slabs.find((slab) => slab.uptoKg >= roundedKg);
  if (matchedSlab) {
    return matchedSlab.charge;
  }

  const lastSlab = slabs[slabs.length - 1];
  if (!lastSlab) {
    return 0;
  }

  // Weight beyond the last defined slab (e.g. slabs only go up to 5kg but
  // the parcel is 7kg) is billed per additional whole kg past that slab.
  const extraKg = roundUpToWholeKg(roundedKg - lastSlab.uptoKg);
  return lastSlab.charge + extraKg * Number(shippingClass.extraPerKgAfterLastSlab || 0);
}

// A shipping class only overrides the default zone-based rate cards when it
// actually specifies a rate. A weight_based class left at 0/0 (the "Normal"
// default every product starts on) explicitly means "use the zone-based rate
// cards" per the admin UI's own hint text — so those lines fall through to
// the same calculation every product used before this feature existed.
function classOverridesDefault(shippingClass) {
  if (!shippingClass || shippingClass.isActive === false) {
    return false;
  }
  if (shippingClass.rateType === "fixed") {
    return Number(shippingClass.fixedAmount || 0) > 0;
  }
  if (shippingClass.rateType === "weight_slab") {
    return safeArray(shippingClass.weightSlabs).length > 0;
  }
  return Number(shippingClass.baseCharge || 0) > 0 || Number(shippingClass.perKgRate || 0) > 0;
}

// fixed/weight_based only — weight_slab is deliberately excluded and
// handled per shipping-class GROUP instead (see calculateOverrideCharges),
// since slab weight must be combined across every line on that class
// before rounding, not rounded per line and then multiplied by qty.
function calculateLineOverrideCharge(line, shippingClass) {
  const qty = Number(line.qty || 0);
  if (qty <= 0) return 0;

  if (shippingClass.rateType === "fixed") {
    return roundMoney(Number(shippingClass.fixedAmount || 0) * qty);
  }

  const perUnitCharge =
    Number(shippingClass.baseCharge || 0) + Number(shippingClass.perKgRate || 0) * billableUnitWeightKg(line);
  return roundMoney(perUnitCharge * qty);
}

function partitionLinesByShippingClass(lines, shippingClasses) {
  const classByCode = new Map(safeArray(shippingClasses).map((row) => [row.code, row]));
  const defaultLines = [];
  const overrideLines = [];

  for (const line of safeArray(lines)) {
    const shippingClass = classByCode.get(line.shippingClass);
    if (classOverridesDefault(shippingClass)) {
      overrideLines.push({ line, shippingClass });
    } else {
      defaultLines.push(line);
    }
  }

  return { defaultLines, overrideLines };
}

// Slab-rate lines are grouped by shipping class code — e.g. two different
// products both on the "Small Parts" class in the same cart get their
// weights combined into one parcel before the slab lookup, matching how a
// courier would actually box and weigh them together, rather than billing
// each product (or each unit) as its own separately-rounded parcel. A cart
// with two different overriding classes gets each class's total computed
// separately and then summed — a genuinely mixed shipment.
function calculateOverrideCharges(overrideLines) {
  const groups = new Map();

  for (const { line, shippingClass } of overrideLines) {
    const code = shippingClass.code;
    if (!groups.has(code)) {
      groups.set(code, { shippingClass, lines: [] });
    }
    groups.get(code).lines.push(line);
  }

  let total = 0;
  for (const { shippingClass, lines } of groups.values()) {
    if (shippingClass.rateType === "weight_slab") {
      const totalWeightKg = lines.reduce((sum, line) => {
        const qty = Number(line.qty || 0);
        return qty > 0 ? sum + billableUnitWeightKg(line) * qty : sum;
      }, 0);
      total += calculateWeightSlabCharge(totalWeightKg, shippingClass);
    } else {
      total += lines.reduce((sum, line) => sum + calculateLineOverrideCharge(line, shippingClass), 0);
    }
  }

  return roundMoney(total);
}

function findRateCard(rateCards, shippingMethod, zone) {
  const cards = safeArray(rateCards).filter((row) => row.isActive !== false);
  let card = cards.find(
    (row) => row.shippingMethod === shippingMethod && row.zone === zone
  );
  if (card) {
    return card;
  }

  card = cards.find(
    (row) => row.shippingMethod === shippingMethod && row.zone === SHIPPING_ZONES.ALL_INDIA
  );
  if (card) {
    return card;
  }

  return null;
}

function calculateShippingQuote({ lines, shippingMethod, destination, shippingStore }) {
  const settings = shippingStore?.settings || {};
  const rateCards = safeArray(shippingStore?.rateCards);
  const totalWeightKg = resolveBillableWeightKg(lines);

  if (
    shippingMethod === SHIPPING_METHODS.LOCAL_PICKUP ||
    shippingMethod === SHIPPING_METHODS.SELF_PICKUP
  ) {
    return {
      shippingMethod,
      zone: SHIPPING_ZONES.ALL_INDIA,
      zoneLabel: SHIPPING_ZONE_LABELS[SHIPPING_ZONES.ALL_INDIA],
      totalWeightKg,
      rateCardId: null,
      baseCharge: 0,
      perKgCharge: 0,
      remoteExtraCharge: 0,
      shippingClassCharge: 0,
      shippingCharge: 0
    };
  }

  // Lines whose product has shipping folded into its price never contribute
  // to the shipping charge — that line's delivery cost was already paid for
  // via the item price, so charging shipping again here would double-bill it.
  const chargeableLines = safeArray(lines).filter((line) => !line.shippingIncluded);

  if (chargeableLines.length === 0) {
    const zoneForIncluded = resolveDestinationZone(destination || {}, settings);
    return {
      shippingMethod,
      zone: zoneForIncluded,
      zoneLabel: SHIPPING_ZONE_LABELS[zoneForIncluded] || SHIPPING_ZONE_LABELS[SHIPPING_ZONES.ALL_INDIA],
      totalWeightKg,
      rateCardId: null,
      baseCharge: 0,
      perKgCharge: 0,
      remoteExtraCharge: 0,
      shippingClassCharge: 0,
      shippingCharge: 0
    };
  }

  const { defaultLines, overrideLines } = partitionLinesByShippingClass(
    chargeableLines,
    shippingStore?.shippingClasses
  );

  const shippingClassCharge = calculateOverrideCharges(overrideLines);

  const zone = resolveDestinationZone(destination || {}, settings);
  const remoteExtraMap = settings.remoteExtraChargeByMethod || {};
  const remoteExtraCharge =
    zone === SHIPPING_ZONES.NORTH_EAST_REMOTE
      ? Number(remoteExtraMap[shippingMethod] || 0)
      : 0;

  if (defaultLines.length === 0) {
    // Every line in the cart is on a shipping class that overrides the
    // default rate cards — nothing left needing a zone-based rate lookup.
    return {
      shippingMethod,
      zone,
      zoneLabel: SHIPPING_ZONE_LABELS[zone] || SHIPPING_ZONE_LABELS[SHIPPING_ZONES.ALL_INDIA],
      totalWeightKg,
      rateCardId: null,
      baseCharge: 0,
      perKgCharge: 0,
      remoteExtraCharge,
      shippingClassCharge,
      shippingCharge: roundMoney(shippingClassCharge + remoteExtraCharge)
    };
  }

  const defaultWeightKg = resolveBillableWeightKg(defaultLines);
  const rateCard = findRateCard(rateCards, shippingMethod, zone);

  if (!rateCard) {
    throw new HttpError(
      400,
      `No active shipping rate found for method '${shippingMethod}'.`
    );
  }

  const baseCharge = Number(rateCard.baseCharge || 0);
  const perKgCharge = Number(rateCard.perKgCharge || 0);
  const weightCharge = roundMoney(defaultWeightKg * perKgCharge);

  const shippingCharge = roundMoney(baseCharge + weightCharge + remoteExtraCharge + shippingClassCharge);

  return {
    shippingMethod,
    zone,
    zoneLabel: SHIPPING_ZONE_LABELS[zone] || SHIPPING_ZONE_LABELS[SHIPPING_ZONES.ALL_INDIA],
    totalWeightKg,
    rateCardId: rateCard.id,
    baseCharge,
    perKgCharge,
    remoteExtraCharge,
    shippingClassCharge,
    shippingCharge
  };
}

module.exports = {
  normalizePincode,
  resolveDestinationZone,
  resolveBillableWeightKg,
  calculateShippingQuote
};
