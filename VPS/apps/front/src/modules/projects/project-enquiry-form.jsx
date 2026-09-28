import { useState } from "react";
import { submitProjectEnquiry } from "./projects.api";

// "Get a quotation" form at the bottom of a project page.

const BRAND = "#E8231A";
const inputStyle = {
  width: "100%", boxSizing: "border-box", fontSize: 14, padding: "11px 12px",
  border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", fontFamily: "inherit"
};
const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 5 };

function waLink(number, text) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function ProjectEnquiryForm({ project, packageInterest, onPackageChange, whatsappNumber }) {
  const [form, setForm] = useState({ name: "", mobile: "", email: "", company: "", city: "", message: "", website: "" });
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const questions = project.enquiryQuestions || [];

  const summaryText = () => [
    `Hi Jenix, I'm interested in: ${project.title}`,
    packageInterest ? `Package: ${packageInterest}` : "",
    ...questions.filter((q) => answers[q]).map((q) => `${q}: ${answers[q]}`),
    form.city ? `City: ${form.city}` : "",
    form.name ? `Name: ${form.name}` : ""
  ].filter(Boolean).join("\n");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await submitProjectEnquiry(project.slug, {
        ...form,
        packageInterest: packageInterest || "",
        answers: questions.map((q) => ({ question: q, answer: String(answers[q] || "").trim() })).filter((a) => a.answer)
      });
      setDone(true);
    } catch (err) {
      setError(err.message || "Could not send. Please try again or contact us on WhatsApp.");
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 16, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <h3 style={{ fontSize: 20, margin: "8px 0 6px", color: "#111827" }}>Thank you, {form.name.split(" ")[0] || "we got it"}!</h3>
        <p style={{ fontSize: 14, color: "#374151", margin: "0 0 16px" }}>
          Our project team will contact you shortly to understand your site and prepare a quotation.
          Have site photos or a parking layout? Send them on WhatsApp — it helps us quote faster.
        </p>
        {whatsappNumber && (
          <a href={waLink(whatsappNumber, summaryText())} target="_blank" rel="noreferrer"
            style={{ display: "inline-block", background: "#16a34a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>
            💬 Send site photos on WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #eef0f3", borderRadius: 16, padding: 20, boxShadow: "0 4px 18px rgba(17,24,39,0.06)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div><label style={labelStyle}>Your name *</label><input required value={form.name} onChange={set("name")} style={inputStyle} autoComplete="name" /></div>
        <div><label style={labelStyle}>Mobile / WhatsApp *</label><input required value={form.mobile} onChange={set("mobile")} style={inputStyle} inputMode="tel" autoComplete="tel" placeholder="+91" /></div>
        <div><label style={labelStyle}>Email</label><input type="email" value={form.email} onChange={set("email")} style={inputStyle} autoComplete="email" /></div>
        <div><label style={labelStyle}>Company / building name</label><input value={form.company} onChange={set("company")} style={inputStyle} autoComplete="organization" /></div>
        <div><label style={labelStyle}>City *</label><input required value={form.city} onChange={set("city")} style={inputStyle} autoComplete="address-level2" /></div>
        {(project.packages || []).length > 0 && (
          <div>
            <label style={labelStyle}>Package you're interested in</label>
            <select value={packageInterest || ""} onChange={(e) => onPackageChange(e.target.value)} style={inputStyle}>
              <option value="">Not sure yet — advise me</option>
              {project.packages.map((pk) => <option key={pk.name} value={pk.name}>{pk.name}</option>)}
            </select>
          </div>
        )}
        {questions.map((q) => (
          <div key={q}>
            <label style={labelStyle}>{q}</label>
            <input value={answers[q] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))} style={inputStyle} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Anything else about your site?</label>
        <textarea rows={3} value={form.message} onChange={set("message")} style={inputStyle} placeholder="e.g. 2 basement levels, one ramp for entry and exit, ~150 cars" />
      </div>
      {/* honeypot: hidden from people, bots fill it */}
      <input value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
      <button type="submit" disabled={busy} style={{
        marginTop: 14, width: "100%", border: "none", borderRadius: 12, padding: "14px 18px",
        background: BRAND, color: "#fff", fontSize: 16, fontWeight: 800, cursor: busy ? "wait" : "pointer"
      }}>
        {busy ? "Sending…" : "Get my free quotation →"}
      </button>
      <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", margin: "8px 0 0" }}>
        No obligation. We only use your details to prepare your quotation.
      </p>
    </form>
  );
}
