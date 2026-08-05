const { z } = require("zod");

// z.coerce.boolean() runs JS `Boolean(value)` under the hood, so the string
// "false" (sent by query params for an unchecked checkbox) coerces to
// `true` — any non-empty string is truthy. This parses "true"/"false"
// strings by their actual text instead.
function booleanQueryParam(defaultValue) {
  return z
    .preprocess((value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return value;
    }, z.boolean())
    .optional()
    .default(defaultValue);
}

module.exports = { booleanQueryParam };
