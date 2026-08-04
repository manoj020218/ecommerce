// Read-only star display — no interactive input needed on the admin side,
// moderators only ever view a rating that was already submitted.
export function StarRating({ value = 0, max = 5 }) {
  const rounded = Math.round(Number(value) || 0);

  return (
    <span aria-label={`${value} out of ${max} stars`} style={{ color: "#f59e0b", letterSpacing: "1px" }}>
      {Array.from({ length: max }, (_, index) => (index < rounded ? "★" : "☆")).join("")}
    </span>
  );
}
