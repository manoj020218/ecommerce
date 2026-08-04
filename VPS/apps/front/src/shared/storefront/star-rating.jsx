import { useState } from "react";

// Display-only when `onChange` isn't passed (review lists); interactive
// click-to-set stars when it is (the "write a review" form).
export function StarRating({ value = 0, onChange, max = 5 }) {
  const [hoverValue, setHoverValue] = useState(0);
  const interactive = typeof onChange === "function";
  const activeValue = interactive && hoverValue ? hoverValue : value;
  const rounded = Math.round(Number(activeValue) || 0);

  return (
    <span
      aria-label={`${value} out of ${max} stars`}
      style={{ color: "#f59e0b", fontSize: "20px", letterSpacing: "2px", cursor: interactive ? "pointer" : "default" }}
      onMouseLeave={interactive ? () => setHoverValue(0) : undefined}
    >
      {Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        return (
          <span
            key={starValue}
            onMouseEnter={interactive ? () => setHoverValue(starValue) : undefined}
            onClick={interactive ? () => onChange(starValue) : undefined}
          >
            {starValue <= rounded ? "★" : "☆"}
          </span>
        );
      })}
    </span>
  );
}
