import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isIosDevice, useIsInstalledApp } from "../../shared/hooks/use-install-prompt";
import {
  disablePush,
  enablePush,
  getCurrentSubscription,
  isPushSupported,
  listMyNotifications,
  notificationPermission,
  syncPushSubscription
} from "../../shared/push/push-client";

// My Account → Notifications (2026-10-03): switch phone notifications on/off
// and see recent order updates + offers.

const BRAND = "#E8231A";

function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso || 0)) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function NotificationsCard() {
  const installed = useIsInstalledApp();
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supported = isPushSupported();
  const iosNeedsInstall = isIosDevice() && !installed;

  useEffect(() => {
    let alive = true;
    getCurrentSubscription().then((sub) => { if (alive) setEnabled(Boolean(sub) && notificationPermission() === "granted"); });
    syncPushSubscription();
    listMyNotifications().then((rows) => { if (alive) setItems(Array.isArray(rows) ? rows : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const turnOn = async () => {
    setBusy(true); setError("");
    try {
      await enablePush();
      setEnabled(true);
    } catch (e) {
      setError(e.message || "Could not switch on notifications.");
    }
    setPermission(notificationPermission());
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true); setError("");
    try { await disablePush(); setEnabled(false); } catch (e) { setError(e.message || "Could not switch off."); }
    setBusy(false);
  };

  return (
    <section style={{ background: "#fff", border: "1px solid #eef0f3", borderRadius: 16, padding: "16px 18px", margin: "0 0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>🔔 Notifications</div>
        {supported && !iosNeedsInstall ? (
          enabled ? (
            <button type="button" onClick={turnOff} disabled={busy}
              style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 10, padding: "7px 12px", fontSize: 13, cursor: "pointer", color: "#374151" }}>
              {busy ? "…" : "On ✓ · Turn off"}
            </button>
          ) : permission === "denied" ? null : (
            <button type="button" onClick={turnOn} disabled={busy}
              style={{ border: "none", background: BRAND, color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              {busy ? "Turning on…" : "Turn on order updates"}
            </button>
          )
        ) : null}
      </div>

      {!supported ? (
        <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 0" }}>This browser doesn't support notifications.</p>
      ) : iosNeedsInstall ? (
        <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 0" }}>
          On iPhone, notifications work in the installed app. <Link to="/app" style={{ color: BRAND, fontWeight: 700 }}>Install the app</Link>, open it and turn them on here.
        </p>
      ) : permission === "denied" ? (
        <p style={{ fontSize: 13, color: "#b45309", margin: "8px 0 0" }}>
          Notifications are blocked for this site. Allow them in your phone's site / app settings, then come back here.
        </p>
      ) : !enabled ? (
        <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 0" }}>
          Get a notification when your payment is received, your order is packed, shipped and delivered — plus offers and new products.
        </p>
      ) : null}
      {error ? <p style={{ fontSize: 13, color: "#b91c1c", margin: "8px 0 0" }}>{error}</p> : null}

      {items.length ? (
        <div style={{ marginTop: 10 }}>
          {items.slice(0, 15).map((n) => (
            <Link key={n.id} to={n.url && n.url.startsWith("/") ? n.url : "/"}
              style={{ display: "block", textDecoration: "none", color: "inherit", borderTop: "1px solid #f1f5f9", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ fontSize: 14, color: "#111827" }}>{n.type === "offer" ? "🏷️ " : ""}{n.title}</strong>
                <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{timeAgo(n.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: "#4b5563", marginTop: 2, lineHeight: 1.45 }}>{n.body}</div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
