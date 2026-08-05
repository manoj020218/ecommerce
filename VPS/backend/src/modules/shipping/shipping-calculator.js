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
  const stateCode = toUpperCode(destination?.stateCode || destination?.state);
  const originStateCode = toUpperCode(settings.originStateCode || "");

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

function calculateWeightSlabCharge(unitWeightKg, shippingClass) {
  const roundedKg = roundUpToWholeKg(unitWeightKg);
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

function calculateLineOverrideCharge(line, shippingClass) {
  const qty = Number(line.qty || 0);
  if (qty <= 0) return 0;

  if (shippingClass.rateType === "fixed") {
    return roundMoney(Number(shippingClass.fixedAmount || 0) * qty);
  }

  if (shippingClass.rateType === "weight_slab") {
    const perUnitCharge = calculateWeightSlabCharge(billableUnitWeightKg(line), shippingClass);
    return roundMoney(perUnitCharge * qty);
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

  const shippingClassCharge = roundMoney(
    overrideLines.reduce((sum, { line, shippingClass }) => sum + calculateLineOverrideCharge(line, shippingClass), 0)
  );

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
