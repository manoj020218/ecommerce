import { Outlet } from "react-router-dom";
import { usePublicSettings } from "./public-settings-context";

const SOCIAL_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X"
};

function buildWhatsAppLink(number, message) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function StorefrontLayout() {
  const { settings } = usePublicSettings();
  const storeProfile = settings.storeProfile || {};
  const contactInformation = settings.contactInformation || {};
  const branding = settings.branding || {};

  const storeName = storeProfile.storeName || "Jenix India";
  const supportEmail =
    contactInformation.publicEmail || storeProfile.supportEmail || "";
  const supportPhone =
    contactInformation.publicPhone || storeProfile.supportMobile || "";
  const supportWhatsApp =
    contactInformation.publicWhatsApp || storeProfile.whatsappNumber || "";
  const publicAddress =
    contactInformation.publicAddress || storeProfile.address || "";
  const supportTiming =
    contactInformation.supportTiming || storeProfile.businessHours || "";

  const socialLinks = Object.entries(contactInformation.socialLinks || {}).filter(
    ([, value]) => Boolean(value)
  );

  return (
    <>
      <Outlet />

      <footer className="storefront-footer-shell">
        <div className="front-shell storefront-footer">
          <section className="storefront-footer-top">
            <div className="storefront-brand">
              {branding.brandLogoUrl ? (
                <img
                  src={branding.brandLogoUrl}
                  alt={storeName}
                  className="storefront-brand-logo"
                  loading="lazy"
                />
              ) : (
                <span className="eyebrow-chip">Jenix</span>
              )}
              <div>
                <p className="eyebrow-text">Storefront contact</p>
                <h2>{storeName}</h2>
                <p className="section-caption">
                  {storeProfile.legalBusinessName || "Business profile, support channels, and pickup details are managed from admin settings."}
                </p>
              </div>
            </div>

            <div className="chip-row">
              {supportPhone ? (
                <a className="btn secondary" href={`tel:${supportPhone}`}>
                  Call Store
                </a>
              ) : null}
              {supportWhatsApp ? (
                <a
                  className="btn whatsapp"
                  href={buildWhatsAppLink(
                    supportWhatsApp,
                    `Need help from ${storeName}.`
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              ) : null}
              {contactInformation.googleMapLink ? (
                <a
                  className="btn secondary"
                  href={contactInformation.googleMapLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Map
                </a>
              ) : null}
            </div>
          </section>

          <section className="storefront-footer-grid">
            <article className="section-block footer-card">
              <div className="section-head">
                <h3>Contact</h3>
              </div>
              <div className="footer-detail-list">
                <p>
                  <strong>Email:</strong> {supportEmail || "--"}
                </p>
                <p>
                  <strong>Phone:</strong> {supportPhone || "--"}
                </p>
                <p>
                  <strong>WhatsApp:</strong> {supportWhatsApp || "--"}
                </p>
                <p>
                  <strong>Support Timing:</strong> {supportTiming || "--"}
                </p>
              </div>
            </article>

            <article className="section-block footer-card">
              <div className="section-head">
                <h3>Store Profile</h3>
              </div>
              <div className="footer-detail-list">
                <p>
                  <strong>Address:</strong> {publicAddress || "--"}
                </p>
                <p>
                  <strong>Pickup Address:</strong> {storeProfile.pickupAddress || "--"}
                </p>
                <p>
                  <strong>State:</strong>{" "}
                  {[storeProfile.state, storeProfile.stateCode]
                    .filter(Boolean)
                    .join(" / ") || "--"}
                </p>
              </div>
            </article>

            <article className="section-block footer-card">
              <div className="section-head">
                <h3>Social</h3>
              </div>
              {socialLinks.length > 0 ? (
                <div className="guide-inline-grid footer-link-grid">
                  {socialLinks.map(([key, value]) => (
                    <a
                      key={key}
                      href={value}
                      target="_blank"
                      rel="noreferrer"
                      className="guide-inline-card footer-link-card"
                    >
                      <span className="eyebrow-chip">{SOCIAL_LABELS[key] || key}</span>
                      <strong>{SOCIAL_LABELS[key] || key}</strong>
                      <p>Open {SOCIAL_LABELS[key] || key} profile</p>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="state-box">Social links will appear here after admin setup.</div>
              )}
            </article>
          </section>
        </div>
      </footer>
    </>
  );
}
