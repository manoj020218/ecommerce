const STATUS_CLASS = {
  active: "green",
  inactive: "gray",
  in_stock: "green",
  low_stock: "amber",
  out_of_stock: "red",
  backorder: "blue"
};

export function StatusBadge({ value, label }) {
  const normalized = String(value || "").toLowerCase();
  const tone = STATUS_CLASS[normalized] || "gray";
  const text =
    label ||
    normalized
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  return <span className={`status-pill ${tone}`}>{text}</span>;
}
