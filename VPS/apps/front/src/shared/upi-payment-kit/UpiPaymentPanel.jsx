// Portable UPI payment panel: tap-to-pay buttons on mobile, a scannable QR
// on desktop. Self-contained — inline styles only, so it drops into any
// React project without also needing to copy a stylesheet. Only external
// dependency is the `qrcode` package. Nothing here is jenix-specific; the
// host page passes in its own order/payee data and an optional
// `onDesktopShown` callback (e.g. to fire a "please upload the screenshot"
// reminder) — the kit itself has no opinion on what that callback does.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildAppSpecificUpiLinks } from "./upi-link.js";
import { isMobileDevice } from "./is-mobile.js";

const APP_BUTTONS = [
  { key: "gpay", label: "Google Pay" },
  { key: "phonepe", label: "PhonePe" },
  { key: "paytm", label: "Paytm" },
  { key: "generic", label: "Other UPI App" }
];

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "16px 14px",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fafafa",
    marginBottom: 16
  },
  hint: {
    margin: 0,
    fontSize: 13,
    color: "#374151",
    textAlign: "center",
    lineHeight: 1.5
  },
  appRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center"
  },
  appBtn: {
    display: "inline-block",
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    background: "#111827",
    borderRadius: 8,
    textDecoration: "none"
  },
  note: {
    margin: 0,
    fontSize: 12.5,
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 1.6,
    maxWidth: 280
  }
};

export function UpiPaymentPanel({ upiId, payeeName, amount, orderNo, note, onDesktopShown, onMobileAppTap }) {
  const canvasRef = useRef(null);
  const [mobile] = useState(() => isMobileDevice());
  const firedRef = useRef(false);
  const mobileTapFiredRef = useRef(false);

  function handleMobileAppTap() {
    // Tapping an app link means they left this tab to (hopefully) pay — the
    // same "remind them to come back and upload the screenshot" moment the
    // desktop QR view fires from onDesktopShown, just triggered by leaving
    // instead of by seeing the code. Fires once per visit either way.
    if (!mobileTapFiredRef.current && onMobileAppTap) {
      mobileTapFiredRef.current = true;
      onMobileAppTap();
    }
  }

  // A zero/undefined amount (e.g. a render before order data has loaded)
  // would produce an "am=0.00" intent — several UPI apps reject that with
  // the same generic error as an invalid payee, so guard it explicitly
  // rather than let a race condition look like a broken VPA.
  const validAmount = Number(amount) > 0;
  const links = upiId && validAmount
    ? buildAppSpecificUpiLinks({ payeeVpa: upiId, payeeName, amount, note, referenceId: orderNo })
    : null;

  useEffect(() => {
    if (!mobile && links?.generic && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, links.generic, { width: 200, margin: 1 }).catch(() => {});
    }
  }, [mobile, links?.generic]);

  useEffect(() => {
    if (!mobile && links && onDesktopShown && !firedRef.current) {
      firedRef.current = true;
      onDesktopShown();
    }
  }, [mobile, links, onDesktopShown]);

  if (!links) {
    return null;
  }

  if (mobile) {
    return (
      <div style={styles.wrap}>
        <p style={styles.hint}>Tap to pay ₹{Number(amount || 0).toFixed(2)} with your UPI app:</p>
        <div style={styles.appRow}>
          {APP_BUTTONS.map((app) => (
            <a key={app.key} href={links[app.key]} style={styles.appBtn} onClick={handleMobileAppTap}>
              {app.label}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <canvas ref={canvasRef} />
      <p style={styles.note}>
        Scan with any UPI app to pay ₹{Number(amount || 0).toFixed(2)}.
        <br />
        <strong>Once payment is done, upload or attach the screenshot below.</strong>
      </p>
    </div>
  );
}
