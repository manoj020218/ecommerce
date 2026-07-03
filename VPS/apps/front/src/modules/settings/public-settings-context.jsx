import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchPublicSettings } from "./public-settings.api";

const DEFAULT_PUBLIC_SETTINGS = {
  storeProfile: {
    storeName: "Jenix India",
    legalBusinessName: "",
    address: "",
    state: "",
    stateCode: "",
    supportEmail: "",
    supportMobile: "",
    whatsappNumber: "",
    businessHours: "",
    pickupAddress: ""
  },
  branding: {
    faviconUrl: "",
    brandLogoUrl: "",
    pwaAppIconUrl: "",
    splashScreenLogoUrl: "",
    themeColor: "#e8231a",
    buttonColor: "#e8231a"
  },
  seoDefaults: {
    homeMetaTitle: "Jenix India",
    homeMetaDescription: "",
    defaultOgImageUrl: "",
    canonicalDomain: "",
    robotsTxt: "User-agent: *\nAllow: /",
    sitemapEnabled: true,
    searchConsoleVerification: "",
    bingVerification: ""
  },
  contactInformation: {
    publicPhone: "",
    publicEmail: "",
    publicWhatsApp: "",
    publicAddress: "",
    googleMapLink: "",
    supportTiming: "",
    socialLinks: {
      facebook: "",
      instagram: "",
      linkedin: "",
      youtube: "",
      x: ""
    }
  },
  meta: {
    updatedAt: ""
  }
};

const PublicSettingsContext = createContext(null);

function normalizeSettings(payload) {
  const next = payload || {};

  return {
    ...DEFAULT_PUBLIC_SETTINGS,
    ...next,
    storeProfile: {
      ...DEFAULT_PUBLIC_SETTINGS.storeProfile,
      ...(next.storeProfile || {})
    },
    branding: {
      ...DEFAULT_PUBLIC_SETTINGS.branding,
      ...(next.branding || {})
    },
    seoDefaults: {
      ...DEFAULT_PUBLIC_SETTINGS.seoDefaults,
      ...(next.seoDefaults || {})
    },
    contactInformation: {
      ...DEFAULT_PUBLIC_SETTINGS.contactInformation,
      ...(next.contactInformation || {}),
      socialLinks: {
        ...DEFAULT_PUBLIC_SETTINGS.contactInformation.socialLinks,
        ...(next.contactInformation?.socialLinks || {})
      }
    },
    meta: {
      ...DEFAULT_PUBLIC_SETTINGS.meta,
      ...(next.meta || {})
    }
  };
}

function clampChannel(channel) {
  return Math.max(0, Math.min(255, channel));
}

function darkenHex(color, ratio = 0.16) {
  const normalized = String(color || "").trim();
  const match = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return "#c41d15";
  }

  const hex = match[1];
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);

  const nextRed = clampChannel(Math.round(red * (1 - ratio)));
  const nextGreen = clampChannel(Math.round(green * (1 - ratio)));
  const nextBlue = clampChannel(Math.round(blue * (1 - ratio)));

  return `#${nextRed.toString(16).padStart(2, "0")}${nextGreen
    .toString(16)
    .padStart(2, "0")}${nextBlue.toString(16).padStart(2, "0")}`;
}

function upsertMetaTag(name, content, attribute = "name") {
  if (!content) {
    return;
  }

  let tag = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, name);
    document.head.append(tag);
  }

  tag.setAttribute("content", content);
}

function upsertLink(rel, href) {
  if (!href) {
    return;
  }

  let tag = document.head.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.append(tag);
  }

  tag.setAttribute("href", href);
}

function applyBranding(branding) {
  const themeColor = branding?.themeColor || "#e8231a";
  const buttonColor = branding?.buttonColor || themeColor;

  document.documentElement.style.setProperty("--brand", buttonColor);
  document.documentElement.style.setProperty(
    "--brand-dark",
    darkenHex(buttonColor)
  );
  document.documentElement.style.setProperty("--accent-theme", themeColor);

  try { localStorage.removeItem("jenix_brand"); } catch (e) {}

  upsertMetaTag("theme-color", themeColor);

  if (branding?.faviconUrl) {
    upsertLink("icon", branding.faviconUrl);
  }
}

export function PublicSettingsProvider({ children }) {
  const [settings, setSettings] = useState(() =>
    normalizeSettings(DEFAULT_PUBLIC_SETTINGS)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setError("");

    try {
      const payload = await fetchPublicSettings();
      const normalized = normalizeSettings(payload);
      setSettings(normalized);
      applyBranding(normalized.branding);
    } catch (requestError) {
      setError(requestError.message || "Public settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loading,
      error,
      reload
    }),
    [error, loading, settings]
  );

  return (
    <PublicSettingsContext.Provider value={value}>
      {children}
    </PublicSettingsContext.Provider>
  );
}

export function usePublicSettings() {
  const context = useContext(PublicSettingsContext);

  if (!context) {
    throw new Error("usePublicSettings must be used inside PublicSettingsProvider.");
  }

  return context;
}
