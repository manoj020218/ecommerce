import { useEffect, useRef, useState } from "react";

// Live camera barcode scanner for tracking / AWB numbers (2026-10-10).
// Replaces "scan from a photo", which rarely read anything: a live video feed
// gets dozens of tries per second with autofocus. Uses the phone's built-in
// BarcodeDetector (Chrome on Android — fast, very accurate) and falls back to
// the zxing library elsewhere (iPhone, desktop webcams).
//
// Accuracy guard: a code is only offered after the SAME value was read at
// least twice, and nothing is filled until staff tap "Use this number" — so a
// misread or a second barcode on the label (pincode, order no.) can't slip in.
// Camera needs HTTPS (admin.jenixindia.com is) and permission.

const NATIVE_FORMATS = [
  "code_128", "code_39", "code_93", "codabar", "itf", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"
];
const CONFIRM_READS = 2;

function sharedPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

export function BarcodeScanModal({ onUse, onClose, lastTrackingId = "" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const stopRef = useRef(() => {});
  const countsRef = useRef(new Map());
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState("");
  const [engine, setEngine] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function accept(raw) {
      const text = String(raw || "").trim();
      if (!text || text.length < 6 || text.length > 40) return;
      const n = (countsRef.current.get(text) || 0) + 1;
      countsRef.current.set(text, n);
      if (n === CONFIRM_READS) {
        try { navigator.vibrate?.(80); } catch { /* not supported */ }
        setCodes((prev) => (prev.includes(text) ? prev : [...prev, text]));
      }
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera. Type the number instead.");
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" }]
          }
        });
      } catch (err) {
        setError(err?.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera for admin.jenixindia.com in browser settings, or type the number."
          : "Could not open the camera. Type the number instead.");
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try { setTorchAvailable(Boolean(track?.getCapabilities?.().torch)); } catch { /* ignore */ }

      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => {});

      // 1) Native BarcodeDetector when it supports 1D courier barcodes.
      let native = null;
      if ("BarcodeDetector" in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
          if (formats.includes("code_128")) native = new window.BarcodeDetector({ formats });
        } catch { native = null; }
      }

      if (native) {
        setEngine("native");
        let timer = null;
        const tick = async () => {
          if (cancelled) return;
          try {
            if (video.readyState >= 2) {
              const found = await native.detect(video);
              found.forEach((b) => accept(b.rawValue));
            }
          } catch { /* frame not ready */ }
          timer = setTimeout(tick, 120);
        };
        tick();
        stopRef.current = () => clearTimeout(timer);
        return;
      }

      // 2) zxing fallback (TRY_HARDER = hint key 3).
      try {
        setEngine("zxing");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader(new Map([[3, true]]), { delayBetweenScanAttempts: 100 });
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) accept(result.getText());
        });
        stopRef.current = () => controls.stop();
      } catch {
        setError("Scanner could not start on this device. Type the number instead.");
      }
    }

    start();
    return () => {
      cancelled = true;
      try { stopRef.current(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch { setTorchAvailable(false); }
  }

  // Codes most like the courier's last number first (same prefix = same booklet).
  const last = String(lastTrackingId || "");
  const ranked = [...codes].sort((a, b) => sharedPrefixLen(b, last) - sharedPrefixLen(a, last));
  const likely = last ? ranked.find((c) => sharedPrefixLen(c, last) >= Math.min(4, last.length - 2)) : "";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", color: "#fff" }}>
        <strong style={{ flex: 1, fontSize: 15 }}>Scan tracking barcode</strong>
        {torchAvailable ? (
          <button type="button" onClick={toggleTorch} style={darkBtn}>{torchOn ? "🔦 Light off" : "🔦 Light"}</button>
        ) : null}
        <button type="button" onClick={onClose} style={darkBtn}>✕ Type instead</button>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{
          position: "absolute", left: "8%", right: "8%", top: "38%", height: "24%",
          border: "3px solid #E8231A", borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)", pointerEvents: "none"
        }} />
        {error ? (
          <div style={{ position: "absolute", left: 16, right: 16, top: 16, background: "#fff", color: "#b91c1c", padding: 12, borderRadius: 10, fontSize: 14 }}>{error}</div>
        ) : null}
      </div>

      <div style={{ background: "#fff", padding: 14, maxHeight: "45%", overflowY: "auto" }}>
        {ranked.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
            Hold the barcode inside the red box, 10–20 cm away, keep steady. Long barcodes: turn the phone sideways.
            {engine ? <span style={{ color: "#9ca3af" }}> · {engine === "native" ? "fast scanner" : "compatible scanner"}</span> : null}
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#4b5563" }}>
              Check the number against the label, then tap it:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ranked.map((code) => (
                <button key={code} type="button" onClick={() => onUse(code)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "12px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  border: code === likely ? "2px solid #16a34a" : "1px solid #d1d5db",
                  background: code === likely ? "#f0fdf4" : "#fff"
                }}>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", wordBreak: "break-all" }}>{code}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#E8231A", padding: "6px 10px", borderRadius: 8, whiteSpace: "nowrap" }}>
                    ✓ Use this
                  </span>
                </button>
              ))}
            </div>
            {likely ? <p style={{ margin: "8px 0 0", fontSize: 11, color: "#15803d" }}>Green = looks like this courier's previous number.</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

const darkBtn = {
  background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer"
};
