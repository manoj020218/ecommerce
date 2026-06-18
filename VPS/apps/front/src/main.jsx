import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AppRouter } from "./app/router";
import { PublicSettingsProvider } from "./modules/settings/public-settings-context";
import { CustomerSessionProvider } from "./shared/auth/customer-session";
import "./styles.css";

const LOCAL_PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalPreviewHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return LOCAL_PREVIEW_HOSTS.has(window.location.hostname);
}

async function resetLocalPreviewServiceWorker() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !isLocalPreviewHost()
  ) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) {
    return;
  }

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    const storefrontCacheKeys = cacheKeys.filter(
      (key) => key.includes("workbox") || key.includes("jenix")
    );
    await Promise.all(storefrontCacheKeys.map((key) => caches.delete(key)));
  }

  if (!window.sessionStorage.getItem("jenix-front-local-sw-reset")) {
    window.sessionStorage.setItem("jenix-front-local-sw-reset", "1");
    window.location.reload();
  }
}

if (isLocalPreviewHost()) {
  resetLocalPreviewServiceWorker().catch(() => {
    // Keep localhost storefront usable even if service-worker cleanup fails.
  });
} else {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <CustomerSessionProvider>
        <PublicSettingsProvider>
          <AppRouter />
        </PublicSettingsProvider>
      </CustomerSessionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
