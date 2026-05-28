import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AppRouter } from "./app/router";
import { PublicSettingsProvider } from "./modules/settings/public-settings-context";
import { CustomerSessionProvider } from "./shared/auth/customer-session";
import "./styles.css";

registerSW({ immediate: true });

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
