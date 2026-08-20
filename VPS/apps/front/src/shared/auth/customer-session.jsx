import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch, SESSION_EXPIRED_EVENT, SESSION_REFRESHED_EVENT } from "../api/http-client";

const SESSION_STORAGE_KEY = "jenix.front.customerSession";
const LEGACY_TOKEN_KEY = "jenix.front.customerToken";

const CustomerSessionContext = createContext(null);

function safeGetStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function safeSetStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_error) {
    // Ignore storage write failures in restricted environments.
  }
}

function safeRemoveStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (_error) {
    // Ignore storage delete failures in restricted environments.
  }
}

function normalizeSession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  const accessToken = typeof session.accessToken === "string" ? session.accessToken : "";
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken:
      typeof session.refreshToken === "string" ? session.refreshToken : "",
    customer:
      session.customer && typeof session.customer === "object" ? session.customer : null
  };
}

function persistSession(session) {
  const normalized = normalizeSession(session);
  if (!normalized) {
    safeRemoveStorage(SESSION_STORAGE_KEY);
    safeRemoveStorage(LEGACY_TOKEN_KEY);
    return;
  }

  safeSetStorage(SESSION_STORAGE_KEY, JSON.stringify(normalized));
  safeSetStorage(LEGACY_TOKEN_KEY, normalized.accessToken);
}

function readStoredSession() {
  const rawSession = safeGetStorage(SESSION_STORAGE_KEY);
  if (rawSession) {
    try {
      return normalizeSession(JSON.parse(rawSession));
    } catch (_error) {
      safeRemoveStorage(SESSION_STORAGE_KEY);
    }
  }

  const legacyToken = safeGetStorage(LEGACY_TOKEN_KEY);
  if (!legacyToken) {
    return null;
  }

  return normalizeSession({
    accessToken: legacyToken,
    refreshToken: "",
    customer: null
  });
}

export function createCustomerSession(payload) {
  return normalizeSession({
    accessToken: payload?.accessToken,
    refreshToken: payload?.refreshToken,
    customer: payload?.customer || null
  });
}

export function CustomerSessionProvider({ children }) {
  const [session, setSessionState] = useState(() => readStoredSession());
  const [loading, setLoading] = useState(false);

  function clearSession() {
    persistSession(null);
    setSessionState(null);
  }

  function setSession(nextSession) {
    const normalized = normalizeSession(nextSession);
    persistSession(normalized);
    setSessionState(normalized);
  }

  useEffect(() => {
    if (!session?.accessToken || session.customer) {
      return undefined;
    }

    let active = true;
    setLoading(true);

    apiFetch("/auth/customer/me", { auth: true })
      .then((customer) => {
        if (!active) {
          return;
        }

        const nextSession = normalizeSession({
          ...session,
          customer
        });
        persistSession(nextSession);
        setSessionState(nextSession);
      })
      .catch(() => {
        if (active) {
          clearSession();
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  // A stored token can go stale (natural JWT expiry) without ever being
  // cleared — any authenticated call that comes back 401 fires this so the
  // session clears everywhere at once, rather than each page having to
  // notice and handle a dead token on its own.
  useEffect(() => {
    function handleSessionExpired() {
      clearSession();
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  // http-client.js silently rotates the access/refresh token pair right
  // before an authenticated request would otherwise go out with an expired
  // one (see ensureFreshAccessToken there) and writes the result straight to
  // localStorage. Mirror that into this context's in-memory session too --
  // otherwise session.refreshToken here goes stale after the first silent
  // rotation, and an explicit logout (account-page.jsx) would revoke an
  // already-superseded refresh session instead of the one actually in use.
  useEffect(() => {
    function handleSessionRefreshed(event) {
      const nextSession = event.detail;
      if (nextSession?.accessToken) {
        setSession(nextSession);
      }
    }
    window.addEventListener(SESSION_REFRESHED_EVENT, handleSessionRefreshed);
    return () =>
      window.removeEventListener(SESSION_REFRESHED_EVENT, handleSessionRefreshed);
  }, []);

  return (
    <CustomerSessionContext.Provider
      value={{
        session,
        customer: session?.customer || null,
        isAuthenticated: Boolean(session?.accessToken),
        loading,
        setSession,
        clearSession
      }}
    >
      {children}
    </CustomerSessionContext.Provider>
  );
}

export function useCustomerSession() {
  const value = useContext(CustomerSessionContext);
  if (!value) {
    throw new Error("CustomerSessionProvider is missing from the app tree.");
  }
  return value;
}

