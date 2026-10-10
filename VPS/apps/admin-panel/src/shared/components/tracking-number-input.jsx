import { useEffect, useRef, useState } from "react";
import { fetchRecentTrackingIds } from "../../modules/shipping/shipping.api";
import { BarcodeScanModal } from "./barcode-scan-modal";

// Tracking / AWB number box (2026-10-10). Staff were retyping 12–15 digit
// numbers where usually only the last 1–2 digits change (courier booklets are
// near-sequential). This box:
//  - on focus while empty, fills the courier's LAST number and selects the
//    last 3 digits, so typing 3 digits replaces just those;
//  - +1 / −1 buttons step the trailing number (keeps prefix + leading zeros);
//  - chips with the last few numbers for this courier;
//  - 📷 Scan opens a live camera barcode scanner (manual typing always works);
//  - warns in red if the number was already used on another shipment.

const cache = new Map(); // courierProfileId → { recent, used }

export function stepTrailingNumber(value, delta) {
  const m = String(value || "").match(/^(.*?)(\d+)$/);
  if (!m) return value;
  const [, prefix, digits] = m;
  const next = BigInt(digits) + BigInt(delta);
  if (next < 0n) return value;
  return prefix + next.toString().padStart(digits.length, "0");
}

export function TrackingNumberInput({ value, onChange, courierProfileId, inputStyle, placeholder, currentOrderNo = "" }) {
  const inputRef = useRef(null);
  const [data, setData] = useState(() => cache.get(courierProfileId || "") || { recent: [], used: [] });
  const [scanning, setScanning] = useState(false);
  // Programmatic focus (after scan / +1 / chip) must not trigger the
  // "fill from last number" behaviour meant for a staff tap.
  const suppressAutoFill = useRef(false);
  function focusQuietly() {
    suppressAutoFill.current = true;
    inputRef.current?.focus();
    setTimeout(() => { suppressAutoFill.current = false; }, 0);
  }

  useEffect(() => {
    let alive = true;
    const key = courierProfileId || "";
    if (!key) { setData({ recent: [], used: [] }); return undefined; }
    if (cache.has(key)) setData(cache.get(key));
    fetchRecentTrackingIds(key, 5)
      .then((res) => {
        const next = { recent: res?.recent || [], used: res?.used || [] };
        cache.set(key, next);
        if (alive) setData(next);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [courierProfileId]);

  const last = data.recent[0]?.trackingId || "";
  const trimmed = String(value || "").trim();
  const duplicate = trimmed
    ? data.used.find((u) => u.trackingId === trimmed && (!currentOrderNo || u.orderNo !== currentOrderNo))
    : null;

  function selectTail(el, count = 3) {
    if (!el) return;
    requestAnimationFrame(() => {
      const len = el.value.length;
      try { el.setSelectionRange(Math.max(0, len - count), len); } catch { /* ignore */ }
    });
  }

  function fillFrom(text, count = 3) {
    onChange(text);
    focusQuietly();
    // wait for the controlled value to render, then select the tail
    setTimeout(() => selectTail(inputRef.current, count), 0);
  }

  function handleFocus(e) {
    if (suppressAutoFill.current) return;
    if (!e.target.value.trim() && last) {
      fillFrom(last, 3);
    } else {
      selectTail(e.target, 0);
    }
  }

  function step(delta) {
    const base = trimmed || last;
    if (!base) return;
    const next = stepTrailingNumber(base, delta);
    onChange(next);
    focusQuietly();
  }

  const small = {
    padding: "0 10px", fontSize: 13, fontWeight: 700, borderRadius: 7, cursor: "pointer",
    border: "1px solid var(--border)", background: "#fff", minWidth: 38
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder || (last ? `Tap to start from last: ${last}` : "Enter tracking / AWB number")}
          style={{
            ...(inputStyle || {}),
            flex: 1, minWidth: 0, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em",
            ...(duplicate ? { borderColor: "#dc2626", background: "#fef2f2" } : {})
          }}
        />
        <button type="button" title="Last digits − 1" style={small} onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)} disabled={!trimmed && !last}>−1</button>
        <button type="button" title="Last digits + 1 (next number in the booklet)" style={small} onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)} disabled={!trimmed && !last}>+1</button>
        <button type="button" title="Scan barcode with camera" onClick={() => setScanning(true)}
          style={{ ...small, background: "#111827", color: "#fff", border: "none", whiteSpace: "nowrap" }}>📷 Scan</button>
      </div>

      {duplicate ? (
        <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
          ⚠ Already used on {duplicate.orderNo || "another shipment"} — change the last digits.
        </span>
      ) : null}

      {data.recent.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Last used:</span>
          {data.recent.slice(0, 3).map((r) => (
            <button key={r.trackingId} type="button" title={r.orderNo ? `Used on ${r.orderNo}` : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fillFrom(r.trackingId, 3)}
              style={{
                fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, padding: "2px 8px", borderRadius: 6,
                border: "1px dashed var(--border)", background: "var(--bg, #f9fafb)", cursor: "pointer"
              }}>
              {r.trackingId}
            </button>
          ))}
          <span style={{ fontSize: 11, color: "var(--muted)" }}>tap → change last digits</span>
        </div>
      ) : null}

      {scanning ? (
        <BarcodeScanModal
          lastTrackingId={last}
          onClose={() => setScanning(false)}
          onUse={(code) => { setScanning(false); onChange(code); focusQuietly(); }}
        />
      ) : null}
    </div>
  );
}
