// Rewrites courier tracking links whose public page has moved.
//
// Shree Maruti (Sep 2026): www.shreemaruticourier.com/tracking.php?awb=X now
// 301s to the shreemaruti.com homepage and drops the AWB, so customers landed
// on the homepage instead of their parcel status. Their live tracking page is
// shreemaruti.com/track-shipment/?awb=X (it reads ?awb= and loads the status).
//
// Works on both templates ("...?awb={trackingId}") and already-built links
// ("...?awb=12345"), because only the prefix before the AWB is swapped.

const LEGACY_TRACKING_PREFIXES = [
  {
    pattern: /^https?:\/\/(www\.)?shreemaruticourier\.com\/tracking\.php\?awb=/i,
    replacement: "https://shreemaruti.com/track-shipment/?awb="
  },
  {
    // Live courier profile had this one; it 404s on their site (Sep 2026)
    pattern: /^https?:\/\/(www\.)?shreemaruti\.com\/tracking\.aspx\?awbnumber=/i,
    replacement: "https://shreemaruti.com/track-shipment/?awb="
  }
];

// Placeholders a template may use for the AWB. The provider used to fill only
// {trackingId}, so templates using {awb} produced links with a literal "{awb}".
const TRACKING_PLACEHOLDERS = ["{{trackingId}}", "{trackingId}", "{{awb}}", "{awb}"];

function fillTrackingPlaceholders(template, trackingId) {
  let url = String(template || "");
  const id = encodeURIComponent(String(trackingId || "").trim());
  for (const token of TRACKING_PLACEHOLDERS) url = url.replaceAll(token, id);
  return url;
}

// Shipments already saved with an unfilled placeholder get their own AWB put in.
// Mutates rows in place; returns true if any changed.
function fillShipmentPlaceholders(shipments) {
  let changed = false;
  if (!Array.isArray(shipments)) return changed;
  for (const row of shipments) {
    if (!row || typeof row.trackingUrl !== "string" || !row.trackingId) continue;
    if (!TRACKING_PLACEHOLDERS.some((token) => row.trackingUrl.includes(token))) continue;
    row.trackingUrl = fillTrackingPlaceholders(row.trackingUrl, row.trackingId);
    changed = true;
  }
  return changed;
}

function upgradeTrackingUrl(url) {
  if (typeof url !== "string" || !url) return url;
  for (const { pattern, replacement } of LEGACY_TRACKING_PREFIXES) {
    if (pattern.test(url)) return url.replace(pattern, replacement);
  }
  return url;
}

// Mutates rows in place; returns true if any field changed.
function upgradeTrackingUrlFields(rows, field) {
  let changed = false;
  if (!Array.isArray(rows)) return changed;
  for (const row of rows) {
    if (!row || typeof row[field] !== "string") continue;
    const next = upgradeTrackingUrl(row[field]);
    if (next !== row[field]) {
      row[field] = next;
      changed = true;
    }
  }
  return changed;
}

module.exports = {
  upgradeTrackingUrl,
  upgradeTrackingUrlFields,
  fillTrackingPlaceholders,
  fillShipmentPlaceholders
};
