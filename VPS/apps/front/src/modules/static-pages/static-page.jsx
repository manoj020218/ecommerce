import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { getPublicPage } from "./static-pages.api";

const SLUG_MAP = {
  "/about-us": "about-us",
  "/contact-us": "contact-us",
  "/privacy-policy": "privacy-policy",
  "/terms-and-conditions": "terms-and-conditions",
  "/refund-policy": "refund-policy",
  "/shipping-policy": "shipping-policy"
};

export function StaticPage() {
  const { slug: paramSlug } = useParams();
  const location = useLocation();
  const slug = paramSlug || SLUG_MAP[location.pathname] || "";

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) { setError("Page not found."); setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError("");
    setPage(null);
    getPublicPage(slug)
      .then((data) => { if (active) setPage(data); })
      .catch(() => { if (active) setError("Page not found."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (page) {
      document.title = page.metaTitle || page.title;
      let meta = document.head.querySelector('meta[name="description"]');
      if (page.metaDescription) {
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("name", "description");
          document.head.append(meta);
        }
        meta.setAttribute("content", page.metaDescription);
      }
    }
  }, [page]);

  if (loading) {
    return (
      <main className="proto-main-shell">
        <div className="proto-page-hero">
          <p style={{ color: "#9ca3af" }}>Loading…</p>
        </div>
      </main>
    );
  }

  if (error || !page) {
    return (
      <main className="proto-main-shell">
        <div className="proto-page-hero">
          <h1>Page Not Found</h1>
          <p>This page does not exist or has been removed.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="proto-main-shell">
      <div className="proto-page-hero">
        <p className="eyebrow-text">Jenix India</p>
        <h1>{page.title}</h1>
      </div>

      <section className="proto-section proto-static-page-body">
        <div
          className="proto-static-content"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </section>
    </main>
  );
}
