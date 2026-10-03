import { useEffect } from "react";
import { Link } from "react-router-dom";
import { InstallAppCard } from "./install-app-card";
import { useIsInstalledApp } from "../../shared/hooks/use-install-prompt";

// /app (2026-10-03): the link we put in order messages — explains the app
// and offers the install button.

const BENEFITS = [
  ["📦", "Track your orders", "Payment, packing, shipping and delivery — all in one place."],
  ["🧾", "Invoices anytime", "Download your GST invoice as PDF whenever you need it."],
  ["🔁", "Reorder in one tap", "Buy the same items again without searching."],
  ["🏷️", "Offers & new products", "Hear first about new launches and offers."]
];

export function AppInstallPage() {
  const installed = useIsInstalledApp();
  useEffect(() => {
    const prev = document.title;
    document.title = "Install the Jenix app | Jenix India";
    return () => { document.title = prev; };
  }, []);

  return (
    <main style={{ background: "#f8fafc", paddingBottom: 40 }}>
      <section style={{ background: "linear-gradient(135deg,#0b1220,#1f2937)", color: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "30px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#fca5a5" }}>JENIX APP</div>
          <h1 style={{ fontSize: 28, margin: "8px 0 8px", lineHeight: 1.2 }}>Jenix India on your home screen</h1>
          <p style={{ fontSize: 15, color: "#d1d5db", margin: 0, lineHeight: 1.6 }}>No Play Store download needed — installs in one tap and takes almost no space.</p>
        </div>
      </section>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px" }}>
        {installed ? (
          <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 12, padding: 14, fontWeight: 700 }}>
            ✅ You're using the app. <Link to="/account" style={{ color: "#166534" }}>Go to My Account →</Link>
          </div>
        ) : (
          <InstallAppCard context="page" allowDismiss={false} />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 8 }}>
          {BENEFITS.map(([icon, title, text]) => (
            <div key={title} style={{ background: "#fff", border: "1px solid #eef0f3", borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 22 }}>{icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111827", margin: "4px 0" }}>{title}</div>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{text}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
