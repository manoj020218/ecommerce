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

function resolveBillableWeightKg(lines) {
  let totalWeightKg = 0;

  for (const line of safeArray(lines)) {
    const qty = Number(line.qty || 0);
    if (qty <= 0) {
      continue;
    }

    const deadWeightKg = Number(line.deadWeightKg || 0);
    const lengthCm = Number(line.lengthCm || 0);
    const widthCm = Number(line.widthCm || 0);
    const heightCm = Number(line.heightCm || 0);

    const volumetricWeightKg =
      lengthCm > 0 && widthCm > 0 && heightCm > 0
        ? (lengthCm * widthCm * heightCm) / 5000
        : 0;

    const billableUnitWeightKg = Math.max(0.2, deadWeightKg, volumetricWeightKg);
    totalWeightKg += billableUnitWeightKg * qty;
  }

  return roundMoney(totalWeightKg);
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

  if (
    shippingMethod === SHIPPING_METHODS.LOCAL_PICKUP ||
    shippingMethod === SHIPPING_METHODS.SELF_PICKUP
  ) {
    return {
      shippingMethod,
      zone: SHIPPING_ZONES.ALL_INDIA,
      zoneLabel: SHIPPING_ZONE_LABELS[SHIPPING_ZONES.ALL_INDIA],
      totalWeightKg: resolveBillableWeightKg(lines),
      rateCardId: null,
      baseCharge: 0,
      perKgCharge: 0,
      remoteExtraCharge: 0,
      shippingCharge: 0
    };
  }

  const totalWeightKg = resolveBillableWeightKg(lines);
  const zone = resolveDestinationZone(destination || {}, settings);
  const rateCard = findRateCard(rateCards, shippingMethod, zone);

  if (!rateCard) {
    throw new HttpError(
      400,
      `No active shipping rate found for method '${shippingMethod}'.`
    );
  }

  const baseCharge = Number(rateCard.baseCharge || 0);
  const perKgCharge = Number(rateCard.perKgCharge || 0);
  const weightCharge = roundMoney(totalWeightKg * perKgCharge);

  const remoteExtraMap = settings.remoteExtraChargeByMethod || {};
  const remoteExtraCharge =
    zone === SHIPPING_ZONES.NORTH_EAST_REMOTE
      ? Number(remoteExtraMap[shippingMethod] || 0)
      : 0;

  const shippingCharge = roundMoney(baseCharge + weightCharge + remoteExtraCharge);

  return {
    shippingMethod,
    zone,
    zoneLabel: SHIPPING_ZONE_LABELS[zone] || SHIPPING_ZONE_LABELS[SHIPPING_ZONES.ALL_INDIA],
    totalWeightKg,
    rateCardId: rateCard.id,
    baseCharge,
    perKgCharge,
    remoteExtraCharge,
    shippingCharge
  };
}

module.exports = {
  normalizePincode,
  resolveDestinationZone,
  resolveBillableWeightKg,
  calculateShippingQuote
};
