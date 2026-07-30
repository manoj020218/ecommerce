const STATUS_CLASS = {
  active: "green",
  inactive: "gray",
  draft: "amber",
  published: "green",
  archived: "gray",
  new: "blue",
  contacted: "amber",
  demo_scheduled: "blue",
  proposal_sent: "amber",
  converted: "green",
  not_interested: "gray",
  closed: "gray",
  paid: "green",
  pending: "amber",
  payment_pending: "amber",
  payment_failed: "red",
  placed: "blue",
  walkin_order_created: "blue",
  invoice_generated: "green",
  ready_for_pickup: "blue",
  completed: "green",
  cancelled: "gray",
  delivered: "green",
  shipped: "blue",
  in_transit: "blue",
  template_inactive: "gray",
  skipped_no_recipient: "amber",
  simulated_sent: "green",
  sent: "green",
  failed: "red",
  system: "blue",
  custom: "gray",
  storefront: "blue",
  walk_in: "amber",
  b2b_request: "blue",
  enabled: "green",
  disabled: "gray",
  online: "blue",
  manual: "gray",
  live: "blue",
  test: "amber",
  generated: "green",
  in_stock: "green",
  low_stock: "amber",
  out_of_stock: "red",
  backorder: "blue",
  pending_packing: "amber",
  packed: "blue",
  ready_to_dispatch: "blue",
  awaiting_admin_approval: "amber",
  awaiting_bank_payment: "amber",
  payment_received: "green",
  packing_started: "blue",
  dispatched: "blue",
  out_for_delivery: "blue",
  delivery_failed: "red",
  returned: "red",
  picked_up: "green"
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
