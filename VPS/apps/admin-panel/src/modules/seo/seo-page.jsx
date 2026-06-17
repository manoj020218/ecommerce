import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { buildPublicSiteUrl } from "../../shared/utils/public-urls";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchSettings, updateSeoDefaults } from "../settings/settings.api";

const EMPTY_SEO_DEFAULTS = {
  homeMetaTitle: "",
  homeMetaDescription: "",
  defaultOgImageUrl: "",
  canonicalDomain: "",
  robotsTxt: "User-agent: *\nAllow: /",
  sitemapEnabled: true,
  searchConsoleVerification: "",
  bingVerification: ""
};

export function SeoPage() {
  const { session } = useAuthSession();
  const canEdit = hasPermission(session, "settings.edit");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [seoDefaults, setSeoDefaults] = useState(EMPTY_SEO_DEFAULTS);

  const refresh = async () => {
    const settings = await fetchSettings();

    setSeoDefaults({
      ...EMPTY_SEO_DEFAULTS,
      ...(settings?.seoDefaults || {})
    });
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await refresh();
    } catch (apiError) {
      setError(apiError.message || "Failed to load SEO workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const configuredCount = useMemo(() => {
    return [
      seoDefaults.homeMetaTitle,
      seoDefaults.homeMetaDescription,
      seoDefaults.canonicalDomain,
      seoDefaults.defaultOgImageUrl,
      seoDefaults.searchConsoleVerification,
      seoDefaults.bingVerification
    ].filter(Boolean).length;
  }, [seoDefaults]);

  const sitemapUrl = useMemo(() => {
    if (!seoDefaults.sitemapEnabled) {
      return "";
    }

    return buildPublicSiteUrl(seoDefaults.canonicalDomain, "/sitemap.xml");
  }, [seoDefaults.canonicalDomain, seoDefaults.sitemapEnabled]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await updateSeoDefaults(seoDefaults);
      await refresh();
      setNotice("SEO defaults updated.");
    } catch (apiError) {
      setError(apiError.message || "Failed to update SEO defaults.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading SEO workspace..." />;
  }

  if (error && !seoDefaults.homeMetaTitle && !seoDefaults.canonicalDomain) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack settings-shell">
      <PageHeader
        title="SEO"
        description="Dedicated SEO workspace for homepage metadata, canonical rules, verification tags, and sitemap publishing."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Canonical Domain</p>
          <h3>{seoDefaults.canonicalDomain || "Not set"}</h3>
          <span>Primary storefront domain</span>
        </article>
        <article className="summary-card">
          <p>Sitemap</p>
          <h3>{seoDefaults.sitemapEnabled ? "Enabled" : "Disabled"}</h3>
          <span>{sitemapUrl || "Sitemap URL unavailable"}</span>
        </article>
        <article className="summary-card">
          <p>Configured Fields</p>
          <h3>{configuredCount}</h3>
          <span>Core SEO defaults populated</span>
        </article>
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>SEO Defaults</h3>
            <p>Homepage title/description, canonical domain, OG image, verification tags, and robots directives.</p>
          </div>
          {sitemapUrl ? (
            <a className="btn btn-secondary btn-small" href={sitemapUrl} target="_blank" rel="noreferrer">
              Open Sitemap
            </a>
          ) : null}
        </div>
        <form className="form-grid wide" onSubmit={onSubmit}>
          <label className="field">
            <span>Home Meta Title</span>
            <input
              value={seoDefaults.homeMetaTitle}
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  homeMetaTitle: event.target.value
                }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field field-full">
            <span>Home Meta Description</span>
            <textarea
              rows="3"
              value={seoDefaults.homeMetaDescription}
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  homeMetaDescription: event.target.value
                }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Canonical Domain</span>
            <input
              value={seoDefaults.canonicalDomain}
              placeholder="https://jenixindia.com"
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  canonicalDomain: event.target.value
                }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Default OG Image URL</span>
            <input
              value={seoDefaults.defaultOgImageUrl}
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  defaultOgImageUrl: event.target.value
                }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Google Verification</span>
            <input
              value={seoDefaults.searchConsoleVerification}
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  searchConsoleVerification: event.target.value
                }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field">
            <span>Bing Verification</span>
            <input
              value={seoDefaults.bingVerification}
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  bingVerification: event.target.value
                }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="field field-full">
            <span>robots.txt</span>
            <textarea
              rows="6"
              value={seoDefaults.robotsTxt}
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  robotsTxt: event.target.value
                }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="inline-check field-full">
            <input
              type="checkbox"
              checked={Boolean(seoDefaults.sitemapEnabled)}
              onChange={(event) =>
                setSeoDefaults((current) => ({
                  ...current,
                  sitemapEnabled: event.target.checked
                }))
              }
              disabled={!canEdit}
            />
            <span>Sitemap generation enabled</span>
          </label>
          {canEdit ? (
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save SEO Defaults"}
              </button>
            </div>
          ) : null}
        </form>
      </article>
    </section>
  );
}
