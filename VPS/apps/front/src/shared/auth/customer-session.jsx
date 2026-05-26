import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../api/http-client";

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

