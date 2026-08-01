// Pragmatic mobile-vs-desktop signal for deciding "tap-to-pay buttons" vs.
// "show a QR code" — the same heuristic used industry-wide for this exact
// decision. Takes the UA string as a parameter so it also works outside a
// browser (SSR, tests) without touching `navigator` directly.
export function isMobileDevice(userAgent = (typeof navigator !== "undefined" ? navigator.userAgent : "")) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent || "");
}
