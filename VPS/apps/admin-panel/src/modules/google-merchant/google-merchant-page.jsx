import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { buildPublicSiteUrl } from "../../shared/utils/public-urls";
import { fetchSettings } from "../settings/settings.api";

export function GoogleMerchantPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(null);

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      setSettings(await fetchSettings());
    } catch (apiError) {
      setError(apiError.message || "Failed to load merchant feed workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  if (loading) {
    return <LoadingBlock label="Loading Google Merchant workspace..." />;
  }

  if (error && !settings) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  const canonicalDomain = settings?.seoDefaults?.canonicalDomain || "";
  const merchantFeedUrl = buildPublicSiteUrl(
    canonicalDomain,
    "/google-merchant-feed.xml"
  );
  const sitemapUrl = settings?.seoDefaults?.sitemapEnabled
    ? buildPublicSiteUrl(canonicalDomain, "/sitemap.xml")
    : "";
  const storeName = settings?.storeProfile?.storeName || "Jenix India";

  return (
    <section className="stack">
      <PageHeader
        title="Google Merchant"
        description="Feed visibility workspace for Merchant Center submission, sitemap access, and storefront metadata readiness."
        actions={
          merchantFeedUrl ? (
            <a className="btn btn-secondary" href={merchantFeedUrl} target="_blank" rel="noreferrer">
              Open Feed
            </a>
          ) : null
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Merchant Feed</p>
          <h3>{merchantFeedUrl ? "Published" : "Not set"}</h3>
          <span>{merchantFeedUrl || "Feed URL unavailable"}</span>
        </article>
        <article className="summary-card">
          <p>Sitemap</p>
          <h3>{settings?.seoDefaults?.sitemapEnabled ? "Enabled" : "Disabled"}</h3>
          <span>{sitemapUrl || "Sitemap URL unavailable"}</span>
        </article>
        <article className="summary-card">
          <p>Canonical Domain</p>
          <h3>{canonicalDomain || "Not set"}</h3>
          <span>Used by SEO/feed consumers</span>
        </article>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Merchant Readiness</h3>
            <p className="muted">This page exposes the exact public URLs and supporting store metadata used by the feed stack.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <th>Store Name</th>
                <td>{storeName}</td>
              </tr>
              <tr>
                <th>Business Email</th>
                <td>{settings?.storeProfile?.supportEmail || "Not set"}</td>
              </tr>
              <tr>
                <th>GSTIN</th>
                <td>{settings?.storeProfile?.gstin || "Not set"}</td>
              </tr>
              <tr>
                <th>Canonical Domain</th>
                <td>{canonicalDomain || "Not set"}</td>
              </tr>
              <tr>
                <th>Merchant Feed URL</th>
                <td>{merchantFeedUrl || "Not set"}</td>
              </tr>
              <tr>
                <th>Sitemap URL</th>
                <td>{sitemapUrl || "Not set"}</td>
              </tr>
              <tr>
                <th>Google Analytics ID</th>
                <td>{settings?.customCodeTags?.googleAnalyticsId || "Not set"}</td>
              </tr>
              <tr>
                <th>Tag Manager ID</th>
                <td>{settings?.customCodeTags?.googleTagManagerId || "Not set"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
