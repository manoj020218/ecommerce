// Portable, framework-agnostic UPI deep-link builder. Zero dependencies on
// any project's data model — copy this whole upi-payment-kit folder into any
// React storefront and wire it to your own order/payment data; the only
// external dependency the rest of the kit needs is the `qrcode` package.

function toUpiAmount(amount) {
  const value = Math.round(Number(amount || 0) * 100) / 100;
  return value.toFixed(2);
}

// scheme lets the same builder produce the generic `upi://` link and the
// app-specific ones (`tez://`, `phonepe://`, `paytmmp://`) — all of them
// accept the identical UPI query params, only the URI scheme differs.
export function buildUpiPaymentLink({ payeeVpa, payeeName, amount, note, referenceId, scheme = "upi" }) {
  if (!payeeVpa) {
    return "";
  }

  const params = new URLSearchParams({
    pa: payeeVpa,
    pn: payeeName || "",
    am: toUpiAmount(amount),
    cu: "INR"
  });
  if (note) {
    params.set("tn", note);
  }
  if (referenceId) {
    params.set("tr", referenceId);
  }

  return `${scheme}://pay?${params.toString()}`;
}

// There is no browser API to enumerate which UPI apps are installed — that's
// an OS-level intent-resolution capability, not something JavaScript can
// query. This offers explicit buttons for the major apps plus a generic
// link; tapping the generic one lets the OS show its own chooser if more
// than one app can handle it.
export function buildAppSpecificUpiLinks(params) {
  return {
    generic: buildUpiPaymentLink(params),
    gpay: buildUpiPaymentLink({ ...params, scheme: "tez" }),
    phonepe: buildUpiPaymentLink({ ...params, scheme: "phonepe" }),
    paytm: buildUpiPaymentLink({ ...params, scheme: "paytmmp" })
  };
}
