import { useState } from "react";

// Section components for a project page (project-page.jsx composes them).

export const BRAND = "#E8231A";
const INK = "#111827";
const MUTED = "#4b5563";
const LINE = "#eef0f3";

export const sectionStyle = { maxWidth: 1120, margin: "0 auto", padding: "36px 16px 0" };
const h2Style = { fontSize: 26, lineHeight: 1.25, fontWeight: 800, color: INK, margin: "0 0 8px" };
const leadStyle = { fontSize: 15, color: MUTED, margin: "0 0 20px", lineHeight: 1.6 };

export function SectionTitle({ kicker, title, lead }) {
  return (
    <div style={{ marginBottom: 6 }}>
      {kicker && <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: BRAND, marginBottom: 6 }}>{kicker}</div>}
      <h2 style={h2Style}>{title}</h2>
      {lead && <p style={leadStyle}>{lead}</p>}
    </div>
  );
}

export function Hero({ project, onQuote, whatsappHref }) {
  return (
    <section style={{ background: "linear-gradient(135deg,#0b1220 0%,#111827 55%,#1f2937 100%)", color: "#fff" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "34px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, alignItems: "center" }}>
        <div>
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", background: "rgba(232,35,26,0.18)", color: "#fca5a5", padding: "5px 10px", borderRadius: 20 }}>
            IOT PROJECT · CUSTOM SOLUTION BY JENIX
          </span>
          <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: "14px 0 10px", fontWeight: 800 }}>{project.title}</h1>
          {project.tagline && <p style={{ fontSize: 17, color: "#d1d5db", margin: "0 0 20px", lineHeight: 1.55 }}>{project.tagline}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => onQuote("")} style={{ border: "none", background: BRAND, color: "#fff", padding: "13px 22px", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
              Get a free quotation
            </button>
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noreferrer" style={{ background: "#16a34a", color: "#fff", padding: "13px 20px", borderRadius: 12, fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
                💬 WhatsApp us
              </a>
            )}
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "16px 0 0" }}>Hardware + software designed in-house · Customised for your site · Pan-India</p>
          {/^https?:\/\//i.test(project.externalUrl || "") && (
            <a href={project.externalUrl} target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 12, color: "#93c5fd", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              {project.externalLabel || "Visit the product website"} ↗
            </a>
          )}
        </div>
        {project.heroImageUrl && (
          <img src={project.heroImageUrl} alt={project.title} style={{ width: "100%", borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.45)" }} />
        )}
      </div>
    </section>
  );
}

export function ProblemSolution({ project }) {
  if (!project.problemText && !project.solutionText) return null;
  const box = (bg, border, icon, title, text) => (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <h3 style={{ fontSize: 18, margin: "8px 0 8px", color: INK }}>{title}</h3>
      <p style={{ fontSize: 15, color: MUTED, margin: 0, lineHeight: 1.65 }}>{text}</p>
    </div>
  );
  return (
    <section style={sectionStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {project.problemText && box("#fff7f6", "#fecaca", "😤", project.problemTitle || "The problem", project.problemText)}
        {project.solutionText && box("#f0fdf4", "#bbf7d0", "💡", project.solutionTitle || "The solution", project.solutionText)}
      </div>
    </section>
  );
}

export function Steps({ steps, image }) {
  if (!steps?.length) return null;
  return (
    <section style={sectionStyle}>
      <SectionTitle kicker="HOW IT WORKS" title="How the system works, step by step" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: BRAND, color: "#fff", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, margin: "10px 0 4px" }}>{s.title}</div>
            <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.55 }}>{s.text}</div>
          </div>
        ))}
      </div>
      {image && <img src={image.url} alt={image.caption} loading="lazy" style={{ width: "100%", borderRadius: 16, marginTop: 16, border: `1px solid ${LINE}` }} />}
    </section>
  );
}

export function Packages({ packages, onQuote }) {
  if (!packages?.length) return null;
  const accents = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];
  return (
    <section style={sectionStyle}>
      <SectionTitle kicker="CHOOSE YOUR LEVEL" title="Packages" lead="Start with what you need today — every package can be upgraded later. Pricing depends on your site, so we quote each project individually." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {packages.map((pk, i) => (
          <div key={pk.name} style={{ background: "#fff", border: `2px solid ${accents[i % 4]}22`, borderTop: `5px solid ${accents[i % 4]}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: accents[i % 4], letterSpacing: ".06em" }}>PACKAGE {i + 1}</div>
            <h3 style={{ fontSize: 22, margin: "4px 0 4px", color: INK }}>{pk.name}</h3>
            {pk.tagline && <p style={{ fontSize: 14, color: MUTED, margin: "0 0 10px" }}>{pk.tagline}</p>}
            {pk.bestFor && <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", background: "#f3f4f6", borderRadius: 8, padding: "6px 10px", margin: "0 0 12px" }}>Best for: {pk.bestFor}</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", flex: 1 }}>
              {pk.features.map((f) => (
                <li key={f} style={{ fontSize: 14, color: "#1f2937", padding: "5px 0", display: "flex", gap: 8 }}>
                  <span style={{ color: accents[i % 4], fontWeight: 800 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => onQuote(pk.name)} style={{ border: "none", background: INK, color: "#fff", padding: "11px 14px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Get quote for {pk.name} →
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Gallery({ items }) {
  const [open, setOpen] = useState(null);
  if (!items?.length) return null;
  return (
    <section style={sectionStyle}>
      <SectionTitle kicker="SEE IT" title="How it looks on site" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {items.map((g, i) => (
          <button key={g.url + i} type="button" onClick={() => setOpen(g)} style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 14, padding: 0, overflow: "hidden", cursor: "zoom-in", textAlign: "left" }}>
            <img src={g.url} alt={g.caption} loading="lazy" style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }} />
            {g.caption && <div style={{ fontSize: 13, color: MUTED, padding: "8px 10px" }}>{g.caption}</div>}
          </button>
        ))}
      </div>
      {open && (
        <div onClick={() => setOpen(null)} role="dialog" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          <img src={open.url} alt={open.caption} style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12 }} />
        </div>
      )}
    </section>
  );
}

export function ChipList({ kicker, title, items, icon = "✓" }) {
  if (!items?.length) return null;
  return (
    <section style={sectionStyle}>
      <SectionTitle kicker={kicker} title={title} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {items.map((u) => (
          <span key={u} style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 30, padding: "9px 14px" }}>{icon} {u}</span>
        ))}
      </div>
    </section>
  );
}

export function WhyUs({ items }) {
  if (!items?.length) return null;
  return (
    <section style={sectionStyle}>
      <div style={{ background: "#111827", color: "#fff", borderRadius: 18, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#fca5a5" }}>WHY JENIX</div>
        <h2 style={{ fontSize: 24, margin: "6px 0 14px" }}>We build the hardware and the software</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {items.map((w) => (
            <div key={w} style={{ display: "flex", gap: 10, fontSize: 14, color: "#e5e7eb", lineHeight: 1.5 }}>
              <span style={{ color: "#4ade80", fontWeight: 800 }}>✓</span>{w}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faqs({ faqs }) {
  if (!faqs?.length) return null;
  return (
    <section style={sectionStyle}>
      <SectionTitle kicker="FAQ" title="Common questions" />
      {faqs.map((f) => (
        <details key={f.q} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}>
          <summary style={{ fontSize: 15, fontWeight: 700, color: INK, cursor: "pointer" }}>{f.q}</summary>
          <p style={{ fontSize: 14, color: MUTED, margin: "8px 0 0", lineHeight: 1.6 }}>{f.a}</p>
        </details>
      ))}
    </section>
  );
}
