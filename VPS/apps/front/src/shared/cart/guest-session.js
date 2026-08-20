const GUEST_SESSION_STORAGE_KEY = "jenix.front.guestSessionId";

// Fallback used only when localStorage itself is unavailable/throwing
// (Safari private browsing historically, storage-blocking browser policies,
// some extensions). Without this, getOrCreateGuestSessionId's catch branch
// used to hand back a brand-new random id on every single call -- every
// cart request got a different guest cart, so items silently "vanished"
// with zero error shown. Caching it here at module scope means the same
// browser tab/page-load at least gets one consistent id for its lifetime,
// even though it still won't survive a reload the way a real persisted id
// would.
let inMemoryFallbackSessionId = "";

function createGuestSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `guest-${crypto.randomUUID()}`;
  }
  return `guest-${Date.now()}`;
}

export function getStoredGuestSessionId() {
  try {
    return window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY) || "";
  } catch (_error) {
    return inMemoryFallbackSessionId;
  }
}

export function getOrCreateGuestSessionId() {
  try {
    const existing = window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const nextSessionId = createGuestSessionId();
    window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, nextSessionId);
    return nextSessionId;
  } catch (_error) {
    if (!inMemoryFallbackSessionId) {
      inMemoryFallbackSessionId = createGuestSessionId();
    }
    return inMemoryFallbackSessionId;
  }
}

export function resetGuestSessionId() {
  const nextSessionId = createGuestSessionId();
  inMemoryFallbackSessionId = nextSessionId;

  try {
    window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, nextSessionId);
  } catch (_error) {
    return nextSessionId;
  }

  return nextSessionId;
}
