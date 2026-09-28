import { useEffect, useState } from "react";
import { fetchProjectEnquiries, updateProjectEnquiry } from "./projects.api";

// Admin → Projects → Enquiries: quotation requests from project pages.

const BRAND = "#E8231A";
const STATUSES = [
  { key: "new", label: "New", bg: "#fee2e2", color: "#b91c1c" },
  { key: "contacted", label: "Contacted", bg: "#fef3c7", color: "#b45309" },
  { key: "quoted", label: "Quoted", bg: "#dbeafe", color: "#1d4ed8" },
  { key: "won", label: "Won", bg: "#dcfce7", color: "#15803d" },
  { key: "lost", label: "Lost", bg: "#f3f4f6", color: "#6b7280" }
];

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

function waLink(mobile, name, project) {
  const digits = String(mobile || "").replace(/[^\d]/g, "");
  const num = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(`Hi ${name}, this is Jenix India regarding your enquiry for ${project}.`)}`;
}

function EnquiryCard({ enquiry, onSaved }) {
  const [status, setStatus] = useState(enquiry.status);
  const [notes, setNotes] = useState(enquiry.notes || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const st = STATUSES.find((s) => s.key === enquiry.status) || STATUSES[0];
  const dirty = status !== enquiry.status || notes !== (enquiry.notes || "");

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const updated = await updateProjectEnquiry(enquiry.id, { status, notes });
      onSaved(updated);
      setMsg("Saved");
    } catch (e) { setMsg(e.message || "Save failed"); }
    setSaving(false);
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #eef0f3", borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{enquiry.name}{enquiry.company ? ` — ${enquiry.company}` : ""}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{enquiry.projectTitle} · {enquiry.city} · {fmt(enquiry.createdAt)}</div>
        </div>
        <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, background: st.bg, color: st.color, padding: "3px 10px", borderRadius: 20 }}>{st.label}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
        <a href={`tel:${enquiry.mobile}`} style={{ fontSize: 13, fontWeight: 600, color: "#111827", background: "#f3f4f6", padding: "6px 12px", borderRadius: 8, textDecoration: "none" }}>📞 {enquiry.mobile}</a>
        <a href={waLink(enquiry.mobile, enquiry.name, enquiry.projectTitle)} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#16a34a", padding: "6px 12px", borderRadius: 8, textDecoration: "none" }}>💬 WhatsApp</a>
        {enquiry.email && <a href={`mailto:${enquiry.email}`} style={{ fontSize: 13, fontWeight: 600, color: "#111827", background: "#f3f4f6", padding: "6px 12px", borderRadius: 8, textDecoration: "none" }}>✉️ {enquiry.email}</a>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6, fontSize: 13 }}>
        <div><span style={{ color: "#6b7280" }}>Package: </span><strong>{enquiry.packageInterest || "Not sure yet"}</strong></div>
        {enquiry.answers.map((a) => (
          <div key={a.question}><span style={{ color: "#6b7280" }}>{a.question}: </span><strong>{a.answer}</strong></div>
        ))}
      </div>
      {enquiry.message && <p style={{ fontSize: 13, color: "#374151", background: "#f9fafb", borderRadius: 8, padding: "8px 10px", margin: "10px 0 0" }}>{enquiry.message}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (call outcome, site visit, quote sent…)"
          style={{ flex: "1 1 260px", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }} />
        <button type="button" onClick={save} disabled={!dirty || saving}
          style={{ fontSize: 13, fontWeight: 700, background: BRAND, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: dirty ? "pointer" : "default", opacity: dirty ? 1 : 0.45 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span style={{ fontSize: 12, color: "#6b7280" }}>{msg}</span>}
      </div>
    </div>
  );
}

export function ProjectEnquiries({ projects }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    fetchProjectEnquiries({ projectId, status })
      .then((data) => { if (alive) setRows(Array.isArray(data) ? data : []); })
      .catch((e) => { if (alive) setError(e.message || "Could not load enquiries"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, status]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ fontSize: 13, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ fontSize: 13, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
      {loading ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading…</p>
        : rows.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13, padding: 20, textAlign: "center", background: "#fff", borderRadius: 12 }}>No enquiries yet. They appear here when visitors request a quote on a project page.</p>
        : rows.map((e) => <EnquiryCard key={e.id} enquiry={e} onSaved={(u) => setRows((cur) => cur.map((r) => (r.id === u.id ? u : r)))} />)}
    </div>
  );
}
