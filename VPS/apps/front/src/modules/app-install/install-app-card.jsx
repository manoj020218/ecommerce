import { useState } from "react";
import { isIosDevice, useInstallPrompt, useIsInstalledApp } from "../../shared/hooks/use-install-prompt";

// "Install our app" card (2026-10-03) — shown on the order success page and
// the /app page. Android/Chrome: real install popup. iPhone: short
// "Share → Add to Home Screen" guide (iOS has no install button). Hidden when
// already running as the installed app.

const BRAND = "#E8231A";
const DISMISS_KEY = "jenix.front.installCardDismissedAt";

function wasDismissedRecently() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return at && Date.now() - at < 7 * 24 * 60 * 60 * 1000;
  } catch (_error) {
    return false;
  }
}

function rememberDismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch (_error) {
    // ignore — the card just shows again next time
  }
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ verticalAlign: "-3px" }}>
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  );
}

export function InstallAppCard({ context = "order", allowDismiss = true }) {
  const installed = useIsInstalledApp();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => allowDismiss && wasDismissedRecently());
  const [done, setDone] = useState(false);
  const ios = isIosDevice();

  if (installed || dismissed || done) return null;
  if (!canInstall && !ios) {
    // Desktop or a browser without install support — a light hint only.
    return context === "page" ? (
      <p style={{ fontSize: 14, color: "#4b5563" }}>
        Open <strong>jenixindia.com</strong> on your phone in Chrome (Android) or Safari (iPhone) to install the app.
      </p>
    ) : null;
  }

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) setDone(true);
  };

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#111827", color: "#fff", borderRadius: 16, padding: "16px 18px", margin: "14px 0" }}>
      <img src="/icons/icon-192.png" alt="" width={48} height={48} style={{ borderRadius: 12, flex: "0 0 auto", background: "#fff" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>📲 Install the Jenix app</div>
        <div style={{ fontSize: 13, color: "#d1d5db", margin: "4px 0 10px", lineHeight: 1.5 }}>
          {context === "order"
            ? "Track this order, download invoices and reorder in one tap — you stay logged in."
            : "Order updates, invoices, offers and new products — right on your home screen."}
        </div>
        {canInstall ? (
          <button type="button" onClick={install}
            style={{ border: "none", background: BRAND, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            Install app
          </button>
        ) : (
          <div style={{ fontSize: 13, background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.6 }}>
            Tap <strong>Share</strong> <ShareIcon /> at the bottom of Safari, then <strong>“Add to Home Screen”</strong>.
          </div>
        )}
      </div>
      {allowDismiss ? (
        <button type="button" aria-label="Not now" onClick={() => { rememberDismiss(); setDismissed(true); }}
          style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
          ×
        </button>
      ) : null}
    </div>
  );
}
