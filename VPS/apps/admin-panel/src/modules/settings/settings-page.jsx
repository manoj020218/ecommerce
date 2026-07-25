import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { WhatsAppConnectCard } from "../whatsapp/whatsapp-connect-card";
import {
  fetchSettings,
  updateBranding,
  updateContactInformation,
  updateCustomCode,
  updateSeoDefaults,
  updateStoreProfile,
  uploadBrandingAsset
} from "./settings.api";

const EMPTY_SETTINGS = {
  storeProfile: {
    storeName: "",
    legalBusinessName: "",
    gstin: "",
    address: "",
    state: "",
    stateCode: "",
    supportEmail: "",
    supportMobile: "",
    whatsappNumber: "",
    bankName: "",
    accountHolderName: "",
    accountNumber: "",
    ifsc: "",
    upiId: "",
    businessHours: "",
    pickupAddress: ""
  },
  branding: {
    faviconUrl: "",
    brandLogoUrl: "",
    adminLogoUrl: "",
    invoiceLogoUrl: "",
    emailLogoUrl: "",
    pwaAppIconUrl: "",
    splashScreenLogoUrl: "",
    themeColor: "#ef4444",
    buttonColor: "#ef4444"
  },
  seoDefaults: {
    homeMetaTitle: "",
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
  customCodeTags: {
    customHeadHtml: "",
    customBodyStartHtml: "",
    customBodyEndHtml: "",
    customCss: "",
    customJs: "",
    googleTagManagerId: "",
    googleAnalyticsId: "",
    facebookPixelId: ""
  },
  meta: {
    updatedAt: "",
    updatedBy: ""
  }
};

const BRANDING_ASSETS = [
  {
    key: "brand-logo",
    label: "Brand Logo",
    field: "brandLogoUrl",
    section: "branding",
    help: "Primary storefront and marketing logo."
  },
  {
    key: "admin-logo",
    label: "Admin Logo",
    field: "adminLogoUrl",
    section: "branding",
    help: "Reserved for admin workspace branding."
  },
  {
    key: "invoice-logo",
    label: "Invoice Logo",
    field: "invoiceLogoUrl",
    section: "branding",
    help: "Stored separately for invoice rendering."
  },
  {
    key: "email-logo",
    label: "Email Logo",
    field: "emailLogoUrl",
    section: "branding",
    help: "Shown on transactional email templates later."
  },
  {
    key: "favicon",
    label: "Favicon",
    field: "faviconUrl",
    section: "branding",
    help: "Browser tab icon for the storefront."
  },
  {
    key: "pwa-app-icon",
    label: "PWA App Icon",
    field: "pwaAppIconUrl",
    section: "branding",
    help: "Home-screen icon for the installable storefront."
  },
  {
    key: "splash-screen-logo",
    label: "Splash Screen Logo",
    field: "splashScreenLogoUrl",
    section: "branding",
    help: "Loading and install splash branding."
  },
  {
    key: "default-og-image",
    label: "Default OG Image",
    field: "defaultOgImageUrl",
    section: "seoDefaults",
    help: "Default social sharing image."
  }
];

function cloneSettings(data) {
  return JSON.parse(JSON.stringify(data));
}

function formatDateTime(value) {
  if (!value) {
    return "Not updated yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function countUploadedAssets(settings) {
  return BRANDING_ASSETS.filter(
    (asset) => settings?.[asset.section]?.[asset.field]
  ).length;
}

function AssetUploadCard({
  asset,
  value,
  uploadingAsset,
  disabled,
  onUpload
}) {
  const isUploading = uploadingAsset === asset.key;

  return (
    <article className="asset-card">
      <div className="asset-card-head">
        <div>
          <strong>{asset.label}</strong>
          <p>{asset.help}</p>
        </div>
        {value ? (
          <a
            className="btn-link"
            href={value}
            target="_blank"
            rel="noreferrer"
          >
            Open
          </a>
        ) : (
          <span className="status-pill gray">Not uploaded</span>
        )}
      </div>

      <div className="asset-preview">
        {value ? (
          <img src={value} alt={asset.label} loading="lazy" />
        ) : (
          <div className="asset-placeholder">Awaiting image upload</div>
        )}
      </div>

      <div className="asset-actions">
        <label className="btn btn-secondary btn-small">
          {isUploading ? "Uploading..." : "Choose Image"}
          <input
            type="file"
            accept="image/*"
            className="hidden-input"
            disabled={disabled || isUploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                onUpload(asset, file);
              }
            }}
          />
        </label>
        <span className="muted">
          {value ? "Live asset ready" : "PNG, JPG, or WebP"}
        </span>
      </div>
    </article>
  );
}

export function SettingsPage() {
  const { session } = useAuthSession();
  const canView = hasPermission(session, "settings.view");
  const canEdit = hasPermission(session, "settings.edit");
  const canEditCustomCode = session?.admin?.role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(() => cloneSettings(EMPTY_SETTINGS));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingSection, setSavingSection] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState("");

  const assetCount = useMemo(() => countUploadedAssets(settings), [settings]);

  async function refreshSettings() {
    const payload = await fetchSettings();
    setSettings(cloneSettings({ ...EMPTY_SETTINGS, ...payload }));
  }

  async function bootstrap() {
    setLoading(true);
    setError("");

    try {
      await refreshSettings();
    } catch (requestError) {
      setError(requestError.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  function updateSectionValue(section, key, value) {
    setSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value
      }
    }));
  }

  function updateSocialLink(key, value) {
    setSettings((current) => ({
      ...current,
      contactInformation: {
        ...current.contactInformation,
        socialLinks: {
          ...current.contactInformation.socialLinks,
          [key]: value
        }
      }
    }));
  }

  async function saveSection(sectionKey, request, successMessage) {
    setSavingSection(sectionKey);
    setError("");
    setNotice("");

    try {
      await request();
      await refreshSettings();
      setNotice(successMessage);
    } catch (requestError) {
      setError(requestError.message || "Settings update failed.");
    } finally {
      setSavingSection("");
    }
  }

  async function handleAssetUpload(asset, file) {
    if (!canEdit) {
      return;
    }

    setUploadingAsset(asset.key);
    setError("");
    setNotice("");

    try {
      await uploadBrandingAsset(asset.key, file);
      await refreshSettings();
      setNotice(`${asset.label} uploaded.`);
    } catch (requestError) {
      setError(requestError.message || "Branding upload failed.");
    } finally {
      setUploadingAsset("");
    }
  }

  if (!canView) {
    return <ErrorBlock message="You do not have permission to view settings." />;
  }

  if (loading) {
    return <LoadingBlock label="Loading settings workspace..." />;
  }

  if (error && !settings?.storeProfile?.storeName) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack settings-shell">
      <PageHeader
        title="Settings"
        description="Phase 1 control center for store profile, branding, SEO defaults, contact information, and custom code."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Store</p>
          <h3>{settings.storeProfile.storeName || "Untitled"}</h3>
          <span>{settings.storeProfile.supportEmail || "Support email not configured"}</span>
        </article>
        <article className="summary-card">
          <p>Brand Assets</p>
          <h3>{assetCount}</h3>
          <span>{BRANDING_ASSETS.length} upload targets available</span>
        </article>
        <article className="summary-card">
          <p>Last Updated</p>
          <h3>{formatDateTime(settings.meta.updatedAt)}</h3>
          <span>{settings.meta.updatedBy || "system"}</span>
        </article>
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Store Profile</h3>
            <p>Business identity, billing contacts, and payment collection details.</p>
          </div>
        </div>
        <form
          className="form-grid wide"
          onSubmit={(event) => {
            event.preventDefault();
            saveSection(
              "storeProfile",
              () => updateStoreProfile(settings.storeProfile),
              "Store profile updated."
            );
          }}
        >
          <label className="field">
            <span>Store Name</span>
            <input
              value={settings.storeProfile.storeName}
              onChange={(event) =>
                updateSectionValue("storeProfile", "storeName", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Legal Business Name</span>
            <input
              value={settings.storeProfile.legalBusinessName}
              onChange={(event) =>
                updateSectionValue("storeProfile", "legalBusinessName", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>GSTIN</span>
            <input
              value={settings.storeProfile.gstin}
              onChange={(event) =>
                updateSectionValue("storeProfile", "gstin", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>State</span>
            <input
              value={settings.storeProfile.state}
              onChange={(event) =>
                updateSectionValue("storeProfile", "state", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>State Code</span>
            <input
              value={settings.storeProfile.stateCode}
              onChange={(event) =>
                updateSectionValue("storeProfile", "stateCode", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Support Email</span>
            <input
              type="email"
              value={settings.storeProfile.supportEmail}
              onChange={(event) =>
                updateSectionValue("storeProfile", "supportEmail", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Support Mobile</span>
            <input
              value={settings.storeProfile.supportMobile}
              onChange={(event) =>
                updateSectionValue("storeProfile", "supportMobile", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>WhatsApp Number</span>
            <input
              value={settings.storeProfile.whatsappNumber}
              onChange={(event) =>
                updateSectionValue("storeProfile", "whatsappNumber", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Business Hours</span>
            <input
              value={settings.storeProfile.businessHours}
              onChange={(event) =>
                updateSectionValue("storeProfile", "businessHours", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field field-full">
            <span>Business Address</span>
            <textarea
              rows="3"
              value={settings.storeProfile.address}
              onChange={(event) =>
                updateSectionValue("storeProfile", "address", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field field-full">
            <span>Pickup Address</span>
            <textarea
              rows="3"
              value={settings.storeProfile.pickupAddress}
              onChange={(event) =>
                updateSectionValue("storeProfile", "pickupAddress", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Bank Name</span>
            <input
              value={settings.storeProfile.bankName}
              onChange={(event) =>
                updateSectionValue("storeProfile", "bankName", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Account Holder Name</span>
            <input
              value={settings.storeProfile.accountHolderName}
              onChange={(event) =>
                updateSectionValue(
                  "storeProfile",
                  "accountHolderName",
                  event.target.value
                )
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Account Number</span>
            <input
              value={settings.storeProfile.accountNumber}
              onChange={(event) =>
                updateSectionValue("storeProfile", "accountNumber", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>IFSC</span>
            <input
              value={settings.storeProfile.ifsc}
              onChange={(event) =>
                updateSectionValue("storeProfile", "ifsc", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>UPI ID</span>
            <input
              value={settings.storeProfile.upiId}
              onChange={(event) =>
                updateSectionValue("storeProfile", "upiId", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          {canEdit ? (
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSection === "storeProfile"}
              >
                {savingSection === "storeProfile" ? "Saving..." : "Save Store Profile"}
              </button>
            </div>
          ) : null}
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Branding</h3>
            <p>Theme colors and image assets used across the storefront and communication channels.</p>
          </div>
        </div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            saveSection(
              "branding",
              () =>
                updateBranding({
                  themeColor: settings.branding.themeColor,
                  buttonColor: settings.branding.buttonColor
                }),
              "Brand colors updated."
            );
          }}
        >
          <label className="field">
            <span>Theme Color</span>
            <input
              type="color"
              value={settings.branding.themeColor || "#ef4444"}
              onChange={(event) =>
                updateSectionValue("branding", "themeColor", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Button Color</span>
            <input
              type="color"
              value={settings.branding.buttonColor || "#ef4444"}
              onChange={(event) =>
                updateSectionValue("branding", "buttonColor", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          {canEdit ? (
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSection === "branding"}
              >
                {savingSection === "branding" ? "Saving..." : "Save Brand Colors"}
              </button>
            </div>
          ) : null}
        </form>

        <div className="asset-grid">
          {BRANDING_ASSETS.map((asset) => (
            <AssetUploadCard
              key={asset.key}
              asset={asset}
              value={settings[asset.section]?.[asset.field]}
              uploadingAsset={uploadingAsset}
              disabled={!canEdit}
              onUpload={handleAssetUpload}
            />
          ))}
        </div>
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>SEO Defaults</h3>
            <p>Homepage metadata, canonical domain, verification tags, and robots.txt defaults.</p>
          </div>
        </div>
        <form
          className="form-grid wide"
          onSubmit={(event) => {
            event.preventDefault();
            saveSection(
              "seoDefaults",
              () => updateSeoDefaults(settings.seoDefaults),
              "SEO defaults updated."
            );
          }}
        >
          <label className="field">
            <span>Home Meta Title</span>
            <input
              value={settings.seoDefaults.homeMetaTitle}
              onChange={(event) =>
                updateSectionValue("seoDefaults", "homeMetaTitle", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field field-full">
            <span>Home Meta Description</span>
            <textarea
              rows="3"
              value={settings.seoDefaults.homeMetaDescription}
              onChange={(event) =>
                updateSectionValue(
                  "seoDefaults",
                  "homeMetaDescription",
                  event.target.value
                )
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Canonical Domain</span>
            <input
              value={settings.seoDefaults.canonicalDomain}
              onChange={(event) =>
                updateSectionValue("seoDefaults", "canonicalDomain", event.target.value)
              }
              placeholder="https://jenixindia.com"
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Default OG Image URL</span>
            <input
              value={settings.seoDefaults.defaultOgImageUrl}
              onChange={(event) =>
                updateSectionValue("seoDefaults", "defaultOgImageUrl", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Google Verification</span>
            <input
              value={settings.seoDefaults.searchConsoleVerification}
              onChange={(event) =>
                updateSectionValue(
                  "seoDefaults",
                  "searchConsoleVerification",
                  event.target.value
                )
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Bing Verification</span>
            <input
              value={settings.seoDefaults.bingVerification}
              onChange={(event) =>
                updateSectionValue("seoDefaults", "bingVerification", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field field-full">
            <span>robots.txt</span>
            <textarea
              rows="6"
              value={settings.seoDefaults.robotsTxt}
              onChange={(event) =>
                updateSectionValue("seoDefaults", "robotsTxt", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="inline-check field-full">
            <input
              type="checkbox"
              checked={Boolean(settings.seoDefaults.sitemapEnabled)}
              onChange={(event) =>
                updateSectionValue(
                  "seoDefaults",
                  "sitemapEnabled",
                  event.target.checked
                )
              }
              disabled={!canEdit}
            />
            <span>Sitemap generation enabled</span>
          </label>
          {canEdit ? (
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSection === "seoDefaults"}
              >
                {savingSection === "seoDefaults" ? "Saving..." : "Save SEO Defaults"}
              </button>
            </div>
          ) : null}
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Contact Information</h3>
            <p>Public support channels, map links, support timing, and social destinations.</p>
          </div>
        </div>
        <form
          className="form-grid wide"
          onSubmit={(event) => {
            event.preventDefault();
            saveSection(
              "contactInformation",
              () => updateContactInformation(settings.contactInformation),
              "Contact information updated."
            );
          }}
        >
          <label className="field">
            <span>Public Phone</span>
            <input
              value={settings.contactInformation.publicPhone}
              onChange={(event) =>
                updateSectionValue("contactInformation", "publicPhone", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Public Email</span>
            <input
              type="email"
              value={settings.contactInformation.publicEmail}
              onChange={(event) =>
                updateSectionValue("contactInformation", "publicEmail", event.target.value)
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Public WhatsApp</span>
            <input
              value={settings.contactInformation.publicWhatsApp}
              onChange={(event) =>
                updateSectionValue(
                  "contactInformation",
                  "publicWhatsApp",
                  event.target.value
                )
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Support Timing</span>
            <input
              value={settings.contactInformation.supportTiming}
              onChange={(event) =>
                updateSectionValue(
                  "contactInformation",
                  "supportTiming",
                  event.target.value
                )
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Google Map Link</span>
            <input
              value={settings.contactInformation.googleMapLink}
              onChange={(event) =>
                updateSectionValue(
                  "contactInformation",
                  "googleMapLink",
                  event.target.value
                )
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field field-full">
            <span>Public Address</span>
            <textarea
              rows="3"
              value={settings.contactInformation.publicAddress}
              onChange={(event) =>
                updateSectionValue(
                  "contactInformation",
                  "publicAddress",
                  event.target.value
                )
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Facebook</span>
            <input
              value={settings.contactInformation.socialLinks.facebook}
              onChange={(event) => updateSocialLink("facebook", event.target.value)}
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Instagram</span>
            <input
              value={settings.contactInformation.socialLinks.instagram}
              onChange={(event) => updateSocialLink("instagram", event.target.value)}
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>LinkedIn</span>
            <input
              value={settings.contactInformation.socialLinks.linkedin}
              onChange={(event) => updateSocialLink("linkedin", event.target.value)}
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>YouTube</span>
            <input
              value={settings.contactInformation.socialLinks.youtube}
              onChange={(event) => updateSocialLink("youtube", event.target.value)}
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>X / Twitter</span>
            <input
              value={settings.contactInformation.socialLinks.x}
              onChange={(event) => updateSocialLink("x", event.target.value)}
              disabled={!canEdit}
            />
          </label>
          {canEdit ? (
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSection === "contactInformation"}
              >
                {savingSection === "contactInformation"
                  ? "Saving..."
                  : "Save Contact Information"}
              </button>
            </div>
          ) : null}
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Custom Code / Tags</h3>
            <p>Tracking IDs, custom snippets, and raw CSS/JS. Only Super Admin can edit this section.</p>
          </div>
          {!canEditCustomCode ? (
            <span className="status-pill amber">Super Admin only</span>
          ) : null}
        </div>
        <form
          className="form-grid wide"
          onSubmit={(event) => {
            event.preventDefault();
            saveSection(
              "customCodeTags",
              () => updateCustomCode(settings.customCodeTags),
              "Custom code and tags updated."
            );
          }}
        >
          <label className="field">
            <span>Google Tag Manager ID</span>
            <input
              value={settings.customCodeTags.googleTagManagerId}
              onChange={(event) =>
                updateSectionValue(
                  "customCodeTags",
                  "googleTagManagerId",
                  event.target.value
                )
              }
              disabled={!canEditCustomCode}
            />
          </label>
          <label className="field">
            <span>Google Analytics ID</span>
            <input
              value={settings.customCodeTags.googleAnalyticsId}
              onChange={(event) =>
                updateSectionValue(
                  "customCodeTags",
                  "googleAnalyticsId",
                  event.target.value
                )
              }
              disabled={!canEditCustomCode}
            />
          </label>
          <label className="field">
            <span>Facebook Pixel ID</span>
            <input
              value={settings.customCodeTags.facebookPixelId}
              onChange={(event) =>
                updateSectionValue(
                  "customCodeTags",
                  "facebookPixelId",
                  event.target.value
                )
              }
              disabled={!canEditCustomCode}
            />
          </label>
          <label className="field field-full">
            <span>Custom Head HTML</span>
            <textarea
              rows="5"
              className="code-area"
              value={settings.customCodeTags.customHeadHtml}
              onChange={(event) =>
                updateSectionValue(
                  "customCodeTags",
                  "customHeadHtml",
                  event.target.value
                )
              }
              disabled={!canEditCustomCode}
            />
          </label>
          <label className="field field-full">
            <span>Custom Body Start HTML</span>
            <textarea
              rows="5"
              className="code-area"
              value={settings.customCodeTags.customBodyStartHtml}
              onChange={(event) =>
                updateSectionValue(
                  "customCodeTags",
                  "customBodyStartHtml",
                  event.target.value
                )
              }
              disabled={!canEditCustomCode}
            />
          </label>
          <label className="field field-full">
            <span>Custom Body End HTML</span>
            <textarea
              rows="5"
              className="code-area"
              value={settings.customCodeTags.customBodyEndHtml}
              onChange={(event) =>
                updateSectionValue(
                  "customCodeTags",
                  "customBodyEndHtml",
                  event.target.value
                )
              }
              disabled={!canEditCustomCode}
            />
          </label>
          <label className="field field-full">
            <span>Custom CSS</span>
            <textarea
              rows="7"
              className="code-area"
              value={settings.customCodeTags.customCss}
              onChange={(event) =>
                updateSectionValue("customCodeTags", "customCss", event.target.value)
              }
              disabled={!canEditCustomCode}
            />
          </label>
          <label className="field field-full">
            <span>Custom JS</span>
            <textarea
              rows="7"
              className="code-area"
              value={settings.customCodeTags.customJs}
              onChange={(event) =>
                updateSectionValue("customCodeTags", "customJs", event.target.value)
              }
              disabled={!canEditCustomCode}
            />
          </label>
          {canEditCustomCode ? (
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSection === "customCodeTags"}
              >
                {savingSection === "customCodeTags"
                  ? "Saving..."
                  : "Save Custom Code"}
              </button>
            </div>
          ) : null}
        </form>
      </article>

      <WhatsAppConnectCard canManage={canEditCustomCode} />
    </section>
  );
}
