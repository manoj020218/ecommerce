import { Link } from "react-router-dom";

// Return-policy badge shown on the product page, cart and checkout
// (2026-09-27). Products are "sold as is" unless the admin marked them
// returnEligible (defective on arrival, 5 days, replacement only).
// One component so the wording is identical everywhere.

const POLICY_URL = "/refund-policy";

// linked=false renders a plain label (product page, 2026-09-30 — the policy
// link now lives in the footer under Legal).
export function ReturnPolicyBadge({ eligible, compact = false, linked = true }) {
  // const style = eligible
  //   ? { background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }
  //   : { background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" };
  // const text = eligible
  //   ? compact ? "✅ Replacement if defective (5 days)" : "✅ Return eligible — replacement if defective on arrival (5 days)"
  //   : compact ? "⚠️ Sold as is — no return" : "⚠️ Sold as is — not returnable";
  // 2026-09-28: user asked not to highlight "not returnable" — "Sold as is"
  // is now a quiet neutral label; the full terms stay on /refund-policy.
  const style = eligible
    ? { background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }
    : { background: "#f3f4f6", color: "#4b5563", border: "1px solid #e5e7eb" };
  const text = eligible
    ? compact ? "✅ Replacement if defective (5 days)" : "✅ Return eligible — replacement if defective on arrival (5 days)"
    : "Sold as is";
  const badgeStyle = {
    ...style,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: compact ? 11 : 12,
    fontWeight: 700,
    padding: compact ? "2px 8px" : "4px 10px",
    borderRadius: 20,
    textDecoration: "none",
    lineHeight: 1.4,
    whiteSpace: "normal"
  };
  if (!linked) return <span style={badgeStyle}>{text}</span>;
  return (
    <Link to={POLICY_URL} title="View return policy" style={badgeStyle}>
      {text}
    </Link>
  );
}

// Shown right above the Pay Now / Place Order button, so the buyer sees the
// policy for their exact items before paying.
export function ReturnPolicyCheckoutNotice({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const asIs = list.filter((i) => !i.returnEligible).length;
  return (
    <div style={{
      margin: "12px 0", padding: "10px 12px", borderRadius: 10, fontSize: 12, lineHeight: 1.5,
      // background: asIs ? "#fff7ed" : "#f0fdf4", border: `1px solid ${asIs ? "#fed7aa" : "#bbf7d0"}`,
      // color: asIs ? "#9a3412" : "#166534"
      background: asIs ? "#f9fafb" : "#f0fdf4", border: `1px solid ${asIs ? "#e5e7eb" : "#bbf7d0"}`,
      color: asIs ? "#4b5563" : "#166534"
    }}>
      {/* old wording (highlighted "not returnable"), replaced 2026-09-28:
      {asIs === list.length
        ? "All items in this order are sold as is at wholesale price and are not returnable. "
        : asIs > 0
          ? `${asIs} of ${list.length} items in this order ${asIs === 1 ? "is" : "are"} sold as is and not returnable. Items marked return-eligible can be replaced if defective on arrival (report within 5 days with an unboxing video). `
          : "Items in this order can be replaced if defective on arrival — report within 5 days with an unboxing video. Replacement only; return shipping is paid by the buyer. "}
      */}
      {asIs === list.length
        ? "Items are sold as is at wholesale price. "
        : asIs > 0
          ? "Items marked return-eligible can be replaced if defective on arrival (report within 5 days with an unboxing video); other items are sold as is. "
          : "Items in this order can be replaced if defective on arrival — report within 5 days with an unboxing video. Replacement only; return shipping is paid by the buyer. "}
      By placing this order you agree to our{" "}
      <Link to={POLICY_URL} target="_blank" style={{ color: "#E8231A", fontWeight: 700 }}>Return Policy</Link>.
    </div>
  );
}

// Short explanation under the badge on the product page.
export function ReturnPolicyNote({ eligible, showLink = true }) {
  if (!eligible && !showLink) return null; // nothing left to say (2026-09-30)
  return (
    <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0", lineHeight: 1.5 }}>
      {eligible
        ? "Report a manufacturing defect within 5 days of delivery with an unboxing video. Replacement only; return shipping is paid by the buyer. "
        // : "Sold at wholesale price as supplied by the manufacturer — not covered by returns or replacement. "}
        // : "Supplied as is at wholesale price, as packed by the manufacturer. "}
        // 2026-09-29: user asked to hide this line on product pages (gave buyers
        // the wrong message) — only the "Return policy" link remains.
        : ""}
      {showLink ? <Link to={POLICY_URL} style={{ color: "#E8231A", fontWeight: 600 }}>Return policy</Link> : null}
    </p>
  );
}
