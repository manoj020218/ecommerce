import { useState } from "react";
import { createProject, updateProject, uploadProjectImage } from "./projects.api";

// Editor for one project page. Plain-text friendly: lists are "one per line",
// steps and FAQs are "Title | text" per line.

const BRAND = "#E8231A";
const input = { width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit" };
const label = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", margin: "12px 0 4px" };
const hint = { fontSize: 11, color: "#9ca3af", fontWeight: 400 };
const card = { background: "#fff", border: "1px solid #eef0f3", borderRadius: 12, padding: 16, marginBottom: 12 };

const lines = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
const pairs = (text, a, b) => lines(text).map((l) => { const [x, ...rest] = l.split("|"); return { [a]: x.trim(), [b]: rest.join("|").trim() }; });
const toLines = (arr) => (arr || []).join("\n");
const toPairs = (arr, a, b) => (arr || []).map((r) => `${r[a]} | ${r[b]}`).join("\n");
const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150);

function formFrom(project) {
  const p = project || {};
  return {
    title: p.title || "", slug: p.slug || "", tagline: p.tagline || "", summary: p.summary || "",
    heroImageUrl: p.heroImageUrl || "",
    problemTitle: p.problemTitle || "", problemText: p.problemText || "",
    solutionTitle: p.solutionTitle || "", solutionText: p.solutionText || "",
    stepsText: toPairs(p.steps, "title", "text"),
    packages: (p.packages || []).map((pk) => ({ ...pk, featuresText: toLines(pk.features) })),
    softwareFeaturesText: toLines(p.softwareFeatures), useCasesText: toLines(p.useCases), whyUsText: toLines(p.whyUs),
    enquiryQuestionsText: toLines(p.enquiryQuestions),
    gallery: p.gallery || [],
    faqsText: toPairs(p.faqs, "q", "a"),
    seoTitle: p.seoTitle || "", seoDescription: p.seoDescription || "",
    isPublished: Boolean(p.isPublished), sortOrder: Number(p.sortOrder || 0)
  };
}

function payloadFrom(f) {
  return {
    title: f.title.trim(), slug: f.slug.trim(), tagline: f.tagline, summary: f.summary, heroImageUrl: f.heroImageUrl,
    problemTitle: f.problemTitle, problemText: f.problemText, solutionTitle: f.solutionTitle, solutionText: f.solutionText,
    steps: pairs(f.stepsText, "title", "text"),
    packages: f.packages.filter((pk) => pk.name.trim()).map((pk) => ({ name: pk.name.trim(), tagline: pk.tagline || "", bestFor: pk.bestFor || "", features: lines(pk.featuresText) })),
    softwareFeatures: lines(f.softwareFeaturesText), useCases: lines(f.useCasesText), whyUs: lines(f.whyUsText),
    enquiryQuestions: lines(f.enquiryQuestionsText),
    gallery: f.gallery.filter((g) => g.url),
    faqs: pairs(f.faqsText, "q", "a"),
    seoTitle: f.seoTitle, seoDescription: f.seoDescription,
    isPublished: f.isPublished, sortOrder: Number(f.sortOrder || 0)
  };
}

function ImageUploadButton({ onUploaded, text = "Upload image" }) {
  const [busy, setBusy] = useState(false);
  return (
    <label style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: BRAND, border: `1px solid ${BRAND}`, padding: "6px 12px", borderRadius: 8, cursor: busy ? "wait" : "pointer" }}>
      {busy ? "Uploading…" : text}
      <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try { const r = await uploadProjectImage(file); onUploaded(r.url); } catch (err) { alert(err.message || "Upload failed"); }
          setBusy(false); e.target.value = "";
        }} />
    </label>
  );
}

export function ProjectEditor({ project, onSaved, onCancel }) {
  const [f, setF] = useState(() => formFrom(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isNew = !project?.id;
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));
  const setPkg = (i, k, v) => setF((cur) => ({ ...cur, packages: cur.packages.map((pk, j) => (j === i ? { ...pk, [k]: v } : pk)) }));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const payload = payloadFrom(f);
      const saved = isNew ? await createProject(payload) : await updateProject(project.id, payload);
      onSaved(saved);
    } catch (e) {
      setError(e.message || "Save failed");
    }
    setSaving(false);
  };

  const field = (k, lbl, opts = {}) => (
    <>
      <label style={label}>{lbl} {opts.hint && <span style={hint}>— {opts.hint}</span>}</label>
      {opts.rows
        ? <textarea rows={opts.rows} value={f[k]} onChange={(e) => set(k, e.target.value)} style={input} placeholder={opts.placeholder} />
        : <input value={f[k]} onChange={(e) => set(k, e.target.value)} style={input} placeholder={opts.placeholder} />}
    </>
  );

  return (
    <div>
      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{isNew ? "New project" : "Edit project"}</h3>
        <label style={label}>Title</label>
        <input value={f.title} style={input}
          onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, title: v, slug: isNew && (!cur.slug || cur.slug === slugify(cur.title)) ? slugify(v) : cur.slug })); }} />
        {field("slug", "URL", { hint: "jenixindia.com/projects/<this>" })}
        {field("tagline", "Tagline", { hint: "one line under the title" })}
        {field("summary", "Summary", { hint: "shown on the Projects list card", rows: 2 })}
        <label style={label}>Main image</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {f.heroImageUrl && <img src={f.heroImageUrl} alt="" style={{ height: 70, borderRadius: 8, border: "1px solid #eef0f3" }} />}
          <ImageUploadButton onUploaded={(url) => set("heroImageUrl", url)} text={f.heroImageUrl ? "Replace" : "Upload"} />
        </div>
      </div>

      <div style={card}>
        {field("problemTitle", "Problem — heading")}
        {field("problemText", "Problem — text", { rows: 4 })}
        {field("solutionTitle", "Solution — heading")}
        {field("solutionText", "Solution — text", { rows: 4 })}
        {field("stepsText", "How it works", { rows: 6, hint: "one step per line: Title | description" })}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Packages</h3>
          <button type="button" onClick={() => set("packages", [...f.packages, { name: "", tagline: "", bestFor: "", featuresText: "" }])}
            style={{ fontSize: 12, fontWeight: 700, color: BRAND, background: "none", border: `1px solid ${BRAND}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>+ Add package</button>
        </div>
        {f.packages.map((pk, i) => (
          <div key={i} style={{ border: "1px solid #eef0f3", borderRadius: 10, padding: 12, marginTop: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <input value={pk.name} onChange={(e) => setPkg(i, "name", e.target.value)} placeholder="Name (e.g. Basic)" style={input} />
              <input value={pk.tagline} onChange={(e) => setPkg(i, "tagline", e.target.value)} placeholder="Tagline" style={input} />
              <input value={pk.bestFor} onChange={(e) => setPkg(i, "bestFor", e.target.value)} placeholder="Best for…" style={input} />
            </div>
            <textarea rows={4} value={pk.featuresText} onChange={(e) => setPkg(i, "featuresText", e.target.value)} placeholder="Features — one per line" style={{ ...input, marginTop: 8 }} />
            <button type="button" onClick={() => set("packages", f.packages.filter((_, j) => j !== i))}
              style={{ fontSize: 12, color: "#b91c1c", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>Remove package</button>
          </div>
        ))}
      </div>

      <div style={card}>
        {field("softwareFeaturesText", "Software features", { rows: 4, hint: "one per line" })}
        {field("useCasesText", "Where it is used", { rows: 4, hint: "one per line" })}
        {field("whyUsText", "Why Jenix", { rows: 4, hint: "one per line" })}
        {field("faqsText", "FAQs", { rows: 6, hint: "one per line: Question | Answer" })}
        {field("enquiryQuestionsText", "Extra questions on the quote form", { rows: 3, hint: "one per line, e.g. Number of parking spaces" })}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Gallery</h3>
          <ImageUploadButton onUploaded={(url) => set("gallery", [...f.gallery, { url, caption: "" }])} text="+ Add image" />
        </div>
        {f.gallery.map((g, i) => (
          <div key={g.url + i} style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <img src={g.url} alt="" style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #eef0f3" }} />
            <input value={g.caption} placeholder="Caption" style={{ ...input, flex: 1 }}
              onChange={(e) => set("gallery", f.gallery.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
            <button type="button" onClick={() => set("gallery", f.gallery.filter((_, j) => j !== i))}
              style={{ fontSize: 12, color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
          </div>
        ))}
      </div>

      <div style={card}>
        {field("seoTitle", "Google title", { hint: "what shows in search results" })}
        {field("seoDescription", "Google description", { rows: 2 })}
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={f.isPublished} onChange={(e) => set("isPublished", e.target.checked)} /> Published (visible on the website)
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            Order <input type="number" value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} style={{ ...input, width: 70 }} />
          </label>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={save} disabled={saving || !f.title.trim() || !f.slug.trim()}
          style={{ fontSize: 14, fontWeight: 700, background: BRAND, color: "#fff", border: "none", padding: "10px 22px", borderRadius: 10, cursor: "pointer" }}>
          {saving ? "Saving…" : "Save project"}
        </button>
        <button type="button" onClick={onCancel} style={{ fontSize: 14, background: "#f3f4f6", border: "none", padding: "10px 18px", borderRadius: 10, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
