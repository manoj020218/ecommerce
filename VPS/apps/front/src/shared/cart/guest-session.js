const GUEST_SESSION_STORAGE_KEY = "jenix.front.guestSessionId";

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
    return "";
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
    return createGuestSessionId();
  }
}

export function resetGuestSessionId() {
  const nextSessionId = createGuestSessionId();

  try {
    window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, nextSessionId);
  } catch (_error) {
    return nextSessionId;
  }

  return nextSessionId;
}
