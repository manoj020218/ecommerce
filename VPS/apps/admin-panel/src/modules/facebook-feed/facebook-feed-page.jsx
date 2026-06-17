import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { buildPublicSiteUrl } from "../../shared/utils/public-urls";
import { fetchSettings } from "../settings/settings.api";

function toWhatsAppLink(value) {
  const normalized = String(value || "").replace(/[^0-9]/g, "");
  return normalized ? `https://wa.me/${normalized}` : "";
}

export function FacebookFeedPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(null);

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      setSettings(await fetchSettings());
    } catch (apiError) {
      setError(apiError.message || "Failed to load Facebook feed workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  if (loading) {
    return <LoadingBlock label="Loading Facebook feed workspace..." />;
  }

  if (error && !settings) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  const canonicalDomain = settings?.seoDefaults?.canonicalDomain || "";
  const facebookFeedUrl = buildPublicSiteUrl(
    canonicalDomain,
    "/facebook-product-feed.xml"
  );
  const pixelId = settings?.customCodeTags?.facebookPixelId || "";
  const whatsappNumber =
    settings?.contactInformation?.publicWhatsApp ||
    settings?.storeProfile?.whatsappNumber ||
    "";
  const whatsappLink = toWhatsAppLink(whatsappNumber);

  return (
    <section className="stack">
      <PageHeader
        title="Facebook Feed"
        description="Dedicated Meta channel workspace for product feed visibility, pixel configuration, and support-channel readiness."
        actions={
          facebookFeedUrl ? (
            <a className="btn btn-secondary" href={facebookFeedUrl} target="_blank" rel="noreferrer">
              Open Feed
            </a>
          ) : null
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Product Feed</p>
          <h3>{facebookFeedUrl ? "Published" : "Not set"}</h3>
          <span>{facebookFeedUrl || "Feed URL unavailable"}</span>
        </article>
        <article className="summary-card">
          <p>Facebook Pixel</p>
          <h3>{pixelId || "Not set"}</h3>
          <span>Meta tracking tag status</span>
        </article>
        <article className="summary-card">
          <p>WhatsApp Support</p>
          <h3>{whatsappLink ? "Configured" : "Not set"}</h3>
          <span>{whatsappNumber || "Support number unavailable"}</span>
        </article>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Meta Channel Details</h3>
            <p className="muted">Reference values used for feed review, catalogue sync, and ad event troubleshooting.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <th>Feed URL</th>
                <td>{facebookFeedUrl || "Not set"}</td>
              </tr>
              <tr>
                <th>Pixel ID</th>
                <td>{pixelId || "Not set"}</td>
              </tr>
              <tr>
                <th>Business Name</th>
                <td>{settings?.storeProfile?.storeName || "Not set"}</td>
              </tr>
              <tr>
                <th>Support Email</th>
                <td>{settings?.contactInformation?.publicEmail || settings?.storeProfile?.supportEmail || "Not set"}</td>
              </tr>
              <tr>
                <th>WhatsApp Link</th>
                <td>{whatsappLink || "Not set"}</td>
              </tr>
              <tr>
                <th>Support Timing</th>
                <td>{settings?.contactInformation?.supportTiming || "Not set"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
