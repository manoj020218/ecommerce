import { useEffect, useState } from "react";
import { fetchProjects } from "./projects.api";
import { ProjectEditor } from "./project-editor";
import { ProjectEnquiries } from "./project-enquiries";

// Admin → Projects: project pages sold on quotation, and their enquiries.

const BRAND = "#E8231A";
const STOREFRONT = "https://jenixindia.com";

export function ProjectsPage() {
  const [tab, setTab] = useState("projects");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (new) | project

  const load = () => {
    setLoading(true); setError("");
    return fetchProjects()
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || "Could not load projects"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const newEnquiries = projects.reduce((s, p) => s + Number(p.newEnquiryCount || 0), 0);
  const tabBtn = (key, text) => (
    <button type="button" onClick={() => { setTab(key); setEditing(null); }} style={{
      fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
      background: tab === key ? BRAND : "#fff", color: tab === key ? "#fff" : "#374151"
    }}>{text}</button>
  );

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Projects</h1>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0" }}>Custom IoT projects sold on quotation — pages on {STOREFRONT}/projects</p>
        </div>
        <div style={{ display: "flex", gap: 6, background: "#f3f4f6", padding: 4, borderRadius: 10 }}>
          {tabBtn("projects", "Projects")}
          {tabBtn("enquiries", `Enquiries${newEnquiries ? ` (${newEnquiries} new)` : ""}`)}
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}

      {tab === "enquiries" && <ProjectEnquiries projects={projects} />}

      {tab === "projects" && editing && (
        <ProjectEditor project={editing.id ? editing : null}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}

      {tab === "projects" && !editing && (
        <>
          <button type="button" onClick={() => setEditing({})} style={{ fontSize: 13, fontWeight: 700, background: BRAND, color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 12 }}>
            + New project
          </button>
          {loading ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading…</p> : projects.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 14, alignItems: "center", background: "#fff", border: "1px solid #eef0f3", borderRadius: 12, padding: 12, marginBottom: 10, flexWrap: "wrap" }}>
              {p.heroImageUrl && <img src={p.heroImageUrl} alt="" style={{ width: 110, height: 66, objectFit: "cover", borderRadius: 8 }} />}
              <div style={{ flex: "1 1 260px" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {p.isPublished ? <span style={{ color: "#15803d", fontWeight: 700 }}>● Published</span> : <span style={{ color: "#9ca3af", fontWeight: 700 }}>○ Draft</span>}
                  {" · "}{p.packages.length} packages · {p.enquiryCount} enquiries{p.newEnquiryCount ? ` (${p.newEnquiryCount} new)` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {p.isPublished && <a href={`${STOREFRONT}/projects/${p.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#374151", background: "#f3f4f6", padding: "7px 12px", borderRadius: 8, textDecoration: "none" }}>View ↗</a>}
                <button type="button" onClick={() => setEditing(p)} style={{ fontSize: 13, fontWeight: 700, color: BRAND, background: "none", border: `1px solid ${BRAND}`, padding: "7px 14px", borderRadius: 8, cursor: "pointer" }}>Edit</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
