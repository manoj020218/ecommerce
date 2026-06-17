import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  completeSetupWizard,
  fetchSetupWizard,
  saveSetupWizardStep
} from "./setup-wizard.api";

const STEP_FIELDS = {
  business_profile: [
    { key: "storeName", label: "Store Name" },
    { key: "legalBusinessName", label: "Legal Business Name" },
    { key: "supportEmail", label: "Support Email", type: "email" },
    { key: "supportMobile", label: "Support Mobile" },
    { key: "whatsappNumber", label: "WhatsApp Number" },
    { key: "state", label: "State" },
    { key: "stateCode", label: "State Code" },
    { key: "storefrontDomain", label: "Storefront Domain" },
    { key: "adminDomain", label: "Admin Domain" },
    { key: "apiDomain", label: "API Domain" },
    { key: "address", label: "Business Address", type: "textarea", full: true, rows: 3 },
    { key: "pickupAddress", label: "Pickup Address", type: "textarea", full: true, rows: 3 }
  ],
  logo_theme: [
    { key: "themeColor", label: "Theme Color", type: "color" },
    { key: "buttonColor", label: "Button Color", type: "color" }
  ],
  gst_profile: [
    { key: "gstin", label: "GSTIN" },
    { key: "state", label: "State" },
    { key: "stateCode", label: "State Code" }
  ],
  invoice_settings: [
    { key: "invoicePrefix", label: "Invoice Prefix" },
    { key: "invoicePostfix", label: "Invoice Postfix" },
    { key: "invoiceStartingNumber", label: "Starting Number", type: "number" },
    { key: "invoiceNumberPadding", label: "Number Padding", type: "number" },
    { key: "showBankDetails", label: "Show Bank Details", type: "checkbox" },
    { key: "showHsnSummary", label: "Show HSN Summary", type: "checkbox" },
    { key: "showShippingLine", label: "Show Shipping Line", type: "checkbox" },
    { key: "showDiscountLine", label: "Show Discount Line", type: "checkbox" },
    { key: "invoiceFooter", label: "Invoice Footer", type: "textarea", full: true, rows: 3 },
    { key: "invoiceTerms", label: "Invoice Terms", type: "textarea", full: true, rows: 4 }
  ],
  admin_user: [
    { key: "name", label: "Admin Name" },
    { key: "email", label: "Admin Email", type: "email" },
    { key: "mobile", label: "Admin Mobile" },
    { key: "password", label: "New Password", type: "password" },
    { key: "confirmPassword", label: "Confirm Password", type: "password" }
  ],
  smtp_email: [
    { key: "host", label: "SMTP Host" },
    { key: "port", label: "SMTP Port", type: "number" },
    { key: "secure", label: "Use TLS / SSL", type: "checkbox" },
    { key: "username", label: "SMTP Username" },
    { key: "fromName", label: "From Name" },
    { key: "fromEmail", label: "From Email", type: "email" },
    { key: "replyToEmail", label: "Reply-To Email", type: "email" },
    { key: "password", label: "SMTP Password", type: "password", full: true }
  ],
  google_login: [
    { key: "enabled", label: "Enable Google Login", type: "checkbox" },
    { key: "clientId", label: "Google Client ID" },
    { key: "redirectUri", label: "Redirect URI" },
    { key: "clientSecret", label: "Client Secret", type: "password", full: true }
  ],
  phone_otp: [
    { key: "enabled", label: "Enable Phone OTP", type: "checkbox" },
    { key: "provider", label: "Provider" },
    { key: "senderId", label: "Sender ID" },
    { key: "templateId", label: "Template ID" },
    { key: "apiBaseUrl", label: "API Base URL" },
    { key: "authToken", label: "Auth Token", type: "password", full: true }
  ],
  payment_gateway: [
    { key: "providerCode", label: "Gateway", type: "select", optionsKey: "paymentGatewayCodes" },
    { key: "isEnabled", label: "Enable Online Gateway", type: "checkbox" },
    {
      key: "mode",
      label: "Mode",
      type: "select",
      options: [
        { value: "test", label: "Test" },
        { value: "live", label: "Live" }
      ]
    },
    { key: "keyId", label: "Key ID" },
    { key: "keySecret", label: "Key Secret", type: "password" },
    { key: "webhookSecret", label: "Webhook Secret", type: "password" }
  ],
  manual_bank_upi: [
    { key: "beneficiaryName", label: "Beneficiary Name" },
    { key: "bankName", label: "Bank Name" },
    { key: "accountHolderName", label: "Account Holder Name" },
    { key: "accountNumber", label: "Account Number" },
    { key: "ifsc", label: "IFSC" },
    { key: "upiId", label: "UPI ID" },
    { key: "instructions", label: "Customer Instructions", type: "textarea", full: true, rows: 3 }
  ],
  shipping_courier: [
    { key: "courierName", label: "Courier Name" },
    { key: "courierCode", label: "Courier Code" },
    { key: "trackingUrlTemplate", label: "Tracking URL Template" },
    { key: "trackingPageUrl", label: "Tracking Page URL" },
    { key: "supportPhone", label: "Support Phone" },
    { key: "supportEmail", label: "Support Email", type: "email" },
    { key: "apiEnabled", label: "API Enabled", type: "checkbox" },
    { key: "apiProvider", label: "API Provider", type: "select", optionsKey: "shippingApiProviders" },
    { key: "pickupPincode", label: "Pickup Pincode" },
    { key: "pickupAddress", label: "Pickup Address", type: "textarea", full: true, rows: 3 }
  ],
  merchant_center: [
    { key: "merchantId", label: "Merchant ID" },
    { key: "claimedDomain", label: "Claimed Domain" },
    { key: "feedUrl", label: "Feed URL" },
    { key: "targetCountry", label: "Target Country" },
    { key: "language", label: "Language" }
  ],
  seo_search_console: [
    { key: "canonicalDomain", label: "Canonical Domain" },
    { key: "searchConsoleVerification", label: "Search Console Verification" },
    { key: "bingVerification", label: "Bing Verification" },
    { key: "googleAnalyticsId", label: "Google Analytics ID" },
    { key: "googleTagManagerId", label: "Google Tag Manager ID" }
  ],
  meta_pixel: [
    { key: "enabled", label: "Enable Meta Pixel", type: "checkbox" },
    { key: "pixelId", label: "Pixel ID" },
    { key: "catalogId", label: "Catalog ID" }
  ],
  backup_settings: [
    { key: "backupDir", label: "Backup Directory" },
    { key: "retentionDays", label: "Retention Days", type: "number" },
    { key: "cronExpression", label: "Cron Expression" },
    { key: "includeUploads", label: "Include Uploads", type: "checkbox" },
    { key: "includeEnvFile", label: "Include .env", type: "checkbox" },
    { key: "runHealthCheckAfterBackup", label: "Run Health Check After Backup", type: "checkbox" },
    { key: "notifyEmail", label: "Backup Notify Email", type: "email" }
  ],
  launch_checklist: [
    { key: "dnsReady", label: "DNS Ready", type: "checkbox" },
    { key: "sslReady", label: "SSL Ready", type: "checkbox" },
    { key: "frontServed", label: "Storefront Served", type: "checkbox" },
    { key: "adminServed", label: "Admin Served", type: "checkbox" },
    { key: "apiServed", label: "API Served", type: "checkbox" },
    { key: "backupVerified", label: "Backup Verified", type: "checkbox" },
    { key: "paymentGatewayReviewed", label: "Payment Gateway Reviewed", type: "checkbox" },
    { key: "merchantFeedReviewed", label: "Merchant Feed Reviewed", type: "checkbox" },
    { key: "searchConsoleSubmitted", label: "Search Console Submitted", type: "checkbox" },
    { key: "firstInvoiceTested", label: "First Invoice Tested", type: "checkbox" }
  ]
};

const SUBMIT_FIELDS = Object.fromEntries(
  Object.entries(STEP_FIELDS).map(([stepKey, fields]) => [
    stepKey,
    fields.map((field) => field.key)
  ])
);

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatDateTime(value) {
  if (!value) {
    return "Not completed yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusColor(step) {
  if (step.complete) {
    return "green";
  }
  return step.optional ? "blue" : "amber";
}

function getStepPayload(stepKey, forms) {
  const payload = {};

  for (const key of SUBMIT_FIELDS[stepKey] || []) {
    payload[key] = forms[stepKey]?.[key];
  }

  return payload;
}

export function SetupWizardPage() {
  const { session } = useAuthSession();
  const canView = hasPermission(session, "settings.view");
  const canEdit = hasPermission(session, "settings.edit");

  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingStep, setSavingStep] = useState("");
  const [completing, setCompleting] = useState(false);

  async function loadWizard() {
    const payload = await fetchSetupWizard();
    setWizard(cloneData(payload));
  }

  async function bootstrap() {
    setLoading(true);
    setError("");

    try {
      await loadWizard();
    } catch (requestError) {
      setError(requestError.message || "Failed to load setup wizard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  const currentStep = wizard?.wizard?.currentStep || "";
  const completionPercent = wizard?.overview?.completionPercent || 0;
  const pendingCount = (wizard?.overview?.totalCount || 0) - (wizard?.overview?.completedCount || 0);

  const stepMap = useMemo(() => {
    return Object.fromEntries((wizard?.overview?.steps || []).map((step) => [step.key, step]));
  }, [wizard]);

  function updateField(stepKey, fieldKey, value) {
    setWizard((current) => ({
      ...current,
      forms: {
        ...current.forms,
        [stepKey]: {
          ...current.forms[stepKey],
          [fieldKey]: value
        }
      }
    }));
  }

  async function handleSave(stepKey) {
    setSavingStep(stepKey);
    setNotice("");
    setError("");

    try {
      const payload = getStepPayload(stepKey, wizard.forms);
      const response = await saveSetupWizardStep(stepKey, payload);
      setWizard(cloneData(response));
      setNotice(`${stepMap[stepKey]?.label || "Step"} saved.`);
    } catch (requestError) {
      setError(requestError.message || "Setup wizard update failed.");
    } finally {
      setSavingStep("");
    }
  }

  async function handleComplete() {
    setCompleting(true);
    setNotice("");
    setError("");

    try {
      const response = await completeSetupWizard();
      setWizard(cloneData(response));
      setNotice("Setup wizard marked complete.");
    } catch (requestError) {
      setError(requestError.message || "Could not complete setup wizard.");
    } finally {
      setCompleting(false);
    }
  }

  if (!canView) {
    return <ErrorBlock message="You do not have permission to view the setup wizard." />;
  }

  if (loading) {
    return <LoadingBlock label="Loading setup wizard..." />;
  }

  if (!wizard) {
    return <ErrorBlock message={error || "Setup wizard data is unavailable."} onRetry={bootstrap} />;
  }

  return (
    <section className="stack wizard-shell">
      <PageHeader
        title="Setup Wizard"
        description="Phase 20 production handoff: deployment domains, launch integrations, backup planning, and final go-live validation."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={bootstrap}>
              Refresh
            </button>
            {canEdit ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleComplete}
                disabled={completing}
              >
                {completing ? "Completing..." : "Mark Phase 20 Complete"}
              </button>
            ) : null}
          </>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Progress</p>
          <h3>{completionPercent}%</h3>
          <span>{wizard.overview.completedCount} of {wizard.overview.totalCount} steps ready</span>
        </article>
        <article className="summary-card">
          <p>Current Step</p>
          <h3>{stepMap[currentStep]?.label || "Complete"}</h3>
          <span>{pendingCount} pending step{pendingCount === 1 ? "" : "s"}</span>
        </article>
        <article className="summary-card">
          <p>Completed At</p>
          <h3>{formatDateTime(wizard.wizard.completedAt)}</h3>
          <span>{wizard.wizard.lastUpdatedBy || "system"}</span>
        </article>
      </div>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Launch Readiness</h3>
            <p>Recommended production domains and the exact step sequence still blocking handoff.</p>
          </div>
        </div>
        <div className="wizard-domain-grid">
          <div className="selection-panel">
            <strong>Storefront</strong>
            <span>{wizard.recommendedDomains.storefrontDomain}</span>
          </div>
          <div className="selection-panel">
            <strong>Admin</strong>
            <span>{wizard.recommendedDomains.adminDomain}</span>
          </div>
          <div className="selection-panel">
            <strong>API</strong>
            <span>{wizard.recommendedDomains.apiDomain}</span>
          </div>
        </div>
        <div className="wizard-progress-bar">
          <span style={{ width: `${completionPercent}%` }} />
        </div>
        <div className="wizard-progress-list">
          {wizard.overview.steps.map((step) => (
            <div
              key={step.key}
              className={`wizard-progress-item${step.key === currentStep ? " current" : ""}${step.complete ? " complete" : ""}`}
            >
              <strong>{step.label}</strong>
              <span>{step.complete ? "Ready" : step.optional ? "Optional" : "Pending"}</span>
            </div>
          ))}
        </div>
      </article>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {wizard.overview.steps.map((step) => {
        const form = wizard.forms[step.key] || {};
        const fields = STEP_FIELDS[step.key] || [];

        return (
          <article key={step.key} className="settings-card wizard-step-card">
            <div className="settings-card-head">
              <div>
                <h3>{step.label}</h3>
                <p>{step.description}</p>
              </div>
              <div className="wizard-pill-row">
                {step.optional ? <span className="status-pill blue">Optional</span> : null}
                <span className={`status-pill ${statusColor(step)}`}>
                  {step.complete ? "Ready" : "Pending"}
                </span>
              </div>
            </div>

            {step.key === "logo_theme" ? (
              <div className="alert-panel">
                <h4>Asset Uploads</h4>
                <p className="muted">
                  Logo, favicon, and OG image uploads remain in the main settings workspace.
                </p>
                <div className="wizard-assets">
                  <span>Brand Logo: {wizard.assets.branding.brandLogoUrl ? "Uploaded" : "Pending"}</span>
                  <span>Admin Logo: {wizard.assets.branding.adminLogoUrl ? "Uploaded" : "Pending"}</span>
                  <span>Favicon: {wizard.assets.branding.faviconUrl ? "Uploaded" : "Pending"}</span>
                  <Link className="btn-link" to="/settings">
                    Open Settings
                  </Link>
                </div>
              </div>
            ) : null}

            <form
              className="form-grid wide"
              onSubmit={(event) => {
                event.preventDefault();
                handleSave(step.key);
              }}
            >
              {fields.map((field) => {
                const isCheckbox = field.type === "checkbox";
                const selectOptions =
                  field.options ||
                  (wizard.options?.[field.optionsKey] || []).map((option) => ({
                    value: option,
                    label: option
                  }));

                if (isCheckbox) {
                  return (
                    <label
                      key={field.key}
                      className={`field inline-check${field.full ? " field-full" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(form[field.key])}
                        onChange={(event) =>
                          updateField(step.key, field.key, event.target.checked)
                        }
                        disabled={!canEdit || savingStep === step.key}
                      />
                      <span>{field.label}</span>
                    </label>
                  );
                }

                return (
                  <label
                    key={field.key}
                    className={`field${field.full ? " field-full" : ""}`}
                  >
                    <span>{field.label}</span>
                    {field.type === "textarea" ? (
                      <textarea
                        rows={field.rows || 3}
                        value={form[field.key] || ""}
                        onChange={(event) =>
                          updateField(step.key, field.key, event.target.value)
                        }
                        disabled={!canEdit || savingStep === step.key}
                      />
                    ) : field.type === "select" ? (
                      <select
                        value={form[field.key] || ""}
                        onChange={(event) =>
                          updateField(step.key, field.key, event.target.value)
                        }
                        disabled={!canEdit || savingStep === step.key}
                      >
                        {selectOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type || "text"}
                        value={form[field.key] ?? ""}
                        onChange={(event) =>
                          updateField(
                            step.key,
                            field.key,
                            field.type === "number"
                              ? Number(event.target.value || 0)
                              : event.target.value
                          )
                        }
                        disabled={!canEdit || savingStep === step.key}
                      />
                    )}
                  </label>
                );
              })}

              {step.key === "admin_user" && form.passwordConfigured ? (
                <p className="muted wizard-field-note">
                  Leave password fields blank to keep the current super admin password.
                </p>
              ) : null}

              {["smtp_email", "google_login", "phone_otp", "payment_gateway"].includes(step.key) ? (
                <p className="muted wizard-field-note">
                  Secret fields can be left blank after first save to preserve the existing credential.
                </p>
              ) : null}

              {step.missingFields?.length ? (
                <p className="muted wizard-field-note">
                  Missing: {step.missingFields.join(", ")}
                </p>
              ) : null}

              {canEdit ? (
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingStep === step.key}
                  >
                    {savingStep === step.key ? "Saving..." : `Save ${step.label}`}
                  </button>
                </div>
              ) : null}
            </form>
          </article>
        );
      })}
    </section>
  );
}
