import { Link } from "react-router-dom";

// Return-policy badge shown on the product page, cart and checkout
// (2026-09-27). Products are "sold as is" unless the admin marked them
// returnEligible (defective on arrival, 5 days, replacement only).
// One component so the wording is identical everywhere.

const POLICY_URL = "/refund-policy";

export function ReturnPolicyBadge({ eligible, compact = false }) {
  const style = eligible
    ? { background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }
    : { background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" };
  const text = eligible
    ? compact ? "✅ Replacement if defective (5 days)" : "✅ Return eligible — replacement if defective on arrival (5 days)"
    : compact ? "⚠️ Sold as is — no return" : "⚠️ Sold as is — not returnable";
  return (
    <Link
      to={POLICY_URL}
      title="View return policy"
      style={{
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
      }}
    >
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
      background: asIs ? "#fff7ed" : "#f0fdf4", border: `1px solid ${asIs ? "#fed7aa" : "#bbf7d0"}`,
      color: asIs ? "#9a3412" : "#166534"
    }}>
      {asIs === list.length
        ? "All items in this order are sold as is at wholesale price and are not returnable. "
        : asIs > 0
          ? `${asIs} of ${list.length} items in this order ${asIs === 1 ? "is" : "are"} sold as is and not returnable. Items marked return-eligible can be replaced if defective on arrival (report within 5 days with an unboxing video). `
          : "Items in this order can be replaced if defective on arrival — report within 5 days with an unboxing video. Replacement only; return shipping is paid by the buyer. "}
      By placing this order you agree to our{" "}
      <Link to={POLICY_URL} target="_blank" style={{ color: "#E8231A", fontWeight: 700 }}>Return Policy</Link>.
    </div>
  );
}

// Short explanation under the badge on the product page.
export function ReturnPolicyNote({ eligible }) {
  return (
    <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0", lineHeight: 1.5 }}>
      {eligible
        ? "Report a manufacturing defect within 5 days of delivery with an unboxing video. Replacement only; return shipping is paid by the buyer. "
        : "Sold at wholesale price as supplied by the manufacturer — not covered by returns or replacement. "}
      <Link to={POLICY_URL} style={{ color: "#E8231A", fontWeight: 600 }}>Return policy</Link>
    </p>
  );
}
