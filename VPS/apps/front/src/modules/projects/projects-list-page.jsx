import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StorefrontLoadingState } from "../../shared/storefront/storefront-ui";
import { listProjects } from "./projects.api";

// /projects — the "Project Series": custom IoT projects sold on quotation.

const BRAND = "#E8231A";

export function ProjectsListPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prev = document.title;
    document.title = "IoT Projects & Custom Solutions | Jenix India";
    listProjects().then((p) => setProjects(Array.isArray(p) ? p : [])).catch(() => {}).finally(() => setLoading(false));
    return () => { document.title = prev; };
  }, []);

  return (
    <main style={{ background: "#f8fafc", paddingBottom: 40 }}>
      <section style={{ background: "linear-gradient(135deg,#0b1220,#1f2937)", color: "#fff" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#fca5a5" }}>JENIX PROJECT SERIES</div>
          <h1 style={{ fontSize: 30, margin: "8px 0 10px", lineHeight: 1.2 }}>IoT projects, built for your site</h1>
          <p style={{ fontSize: 16, color: "#d1d5db", margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
            We design complete IoT solutions — hardware and software — for buildings, businesses and institutions.
            Each project is customised to your requirement and quoted individually.
          </p>
        </div>
      </section>
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 16px 0" }}>
        {loading ? <StorefrontLoadingState label="Loading projects..." /> : projects.length === 0 ? (
          <p style={{ color: "#6b7280" }}>New projects are coming soon.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.slug}`} style={{ textDecoration: "none", color: "inherit", background: "#fff", border: "1px solid #eef0f3", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {p.heroImageUrl && <img src={p.heroImageUrl} alt={p.title} loading="lazy" style={{ width: "100%", height: 190, objectFit: "cover" }} />}
                <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1 }}>
                  <h2 style={{ fontSize: 18, margin: "0 0 6px", color: "#111827", lineHeight: 1.3 }}>{p.title}</h2>
                  <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 12px", lineHeight: 1.55, flex: 1 }}>{p.summary || p.tagline}</p>
                  {p.packageNames?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {p.packageNames.map((n) => <span key={n} style={{ fontSize: 11, fontWeight: 700, background: "#f3f4f6", color: "#374151", padding: "3px 8px", borderRadius: 20 }}>{n}</span>)}
                    </div>
                  )}
                  <span style={{ color: BRAND, fontWeight: 800, fontSize: 14 }}>View project & get a quote →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
