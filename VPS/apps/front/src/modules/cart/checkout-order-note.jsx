// Optional note from the buyer at checkout (2026-10-02) — special request,
// customisation, delivery instructions. Plain text only (the backend also
// strips any HTML), max 500 characters. Shows on the admin order page as
// "Customer note".

const MAX = 500;

export function CheckoutOrderNote({ value, onChange }) {
  const onInput = (event) => onChange(event.target.value.replace(/[<>]/g, "").slice(0, MAX));
  return (
    <label style={{ display: "block", margin: "14px 0 6px" }}>
      <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
        Note for us <span style={{ fontWeight: 400, color: "#6b7280" }}>(optional)</span>
      </span>
      <span style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        Any special requirement, customisation or delivery instruction for this order.
      </span>
      <textarea
        value={value}
        onChange={onInput}
        rows={3}
        maxLength={MAX}
        placeholder="e.g. Please share GST invoice on WhatsApp · Deliver after 5 PM · Need 2 extra remotes"
        style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10, fontFamily: "inherit", resize: "vertical" }}
      />
      <span style={{ display: "block", textAlign: "right", fontSize: 11, color: "#9ca3af" }}>{value.length}/{MAX}</span>
    </label>
  );
}
