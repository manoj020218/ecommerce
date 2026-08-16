const PARTNER_ATTRIBUTION_STORAGE_KEY = "jenix.front.partnerAttribution";

// No client-side expiry judgement here on purpose -- each partner has its
// own attributionWindowDays, which only the backend knows. This just
// records what was captured and when; resolveAttribution on the backend
// (backend/src/modules/partners/partners.service.js) is the sole authority
// on whether it's still valid by the time an order is placed.
export function capturePartnerAttribution(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const record = { code: normalized, capturedAt: new Date().toISOString() };

  try {
    window.localStorage.setItem(PARTNER_ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
  } catch (_error) {
    // Storage unavailable (private browsing, quota, etc.) -- attribution is
    // best-effort, never worth failing the visit over.
  }

  return record;
}

export function getStoredPartnerAttribution() {
  try {
    const raw = window.localStorage.getItem(PARTNER_ATTRIBUTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.code || !parsed.capturedAt) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}
