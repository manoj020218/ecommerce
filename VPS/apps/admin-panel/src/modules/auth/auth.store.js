const STORAGE_KEY = "jenix_admin_session_v1";
const AUTH_CHANGE_EVENT = "jenix-admin-auth-changed";

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (!parsed.accessToken || !parsed.refreshToken) {
    return null;
  }

  return parsed;
}

let authSession = readStoredSession();

export function getAuthSession() {
  return authSession;
}

export function setAuthSession(nextSession) {
  authSession = nextSession;

  if (typeof window !== "undefined") {
    if (nextSession) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  }
}

export function clearAuthSession() {
  setAuthSession(null);
}

export function subscribeAuthSession(listener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onAuthChange = () => {
    authSession = readStoredSession();
    listener(authSession);
  };

  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) {
      onAuthChange();
    }
  };

  window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange);
    window.removeEventListener("storage", onStorage);
  };
}
