const {
  parseListCustomersQuery,
  parseCreateCustomerPayload,
  parseUpdateCustomerPayload,
  parseApproveOrderRequestPayload,
  parseUpdateB2BOrderStatusPayload
} = require("../customers.validator");

describe("parseListCustomersQuery", () => {
  it("returns defaults when called with empty object", () => {
    const result = parseListCustomersQuery({});
    expect(result).toEqual({ q: "", customerType: "", approvalStatus: "", limit: 100 });
  });

  it("coerces string limit to number", () => {
    const result = parseListCustomersQuery({ limit: "50" });
    expect(result.limit).toBe(50);
  });

  it("throws on limit out of range", () => {
    expect(() => parseListCustomersQuery({ limit: "0" })).toThrow();
    expect(() => parseListCustomersQuery({ limit: "501" })).toThrow();
  });
});

describe("parseCreateCustomerPayload", () => {
  const base = { name: "Ravi Kumar", email: "ravi@example.com", password: "secret1" };

  it("parses a valid payload with defaults filled in", () => {
    const result = parseCreateCustomerPayload(base);
    expect(result.name).toBe("Ravi Kumar");
    expect(result.customerType).toBe("retail");
    expect(result.orderMode).toBe("online");
    expect(result.creditAllowed).toBe(false);
  });

  it("rejects missing name", () => {
    expect(() => parseCreateCustomerPayload({ email: "x@x.com" })).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() => parseCreateCustomerPayload({ name: "Test", email: "not-an-email" })).toThrow();
  });

  it("rejects password shorter than 6 chars", () => {
    expect(() => parseCreateCustomerPayload({ name: "Test", password: "abc" })).toThrow();
  });

  it("throws when payload is an array", () => {
    expect(() => parseCreateCustomerPayload([])).toThrow();
  });

  it("throws when payload is null", () => {
    expect(() => parseCreateCustomerPayload(null)).toThrow();
  });
});

describe("parseUpdateCustomerPayload", () => {
  it("accepts partial fields", () => {
    const result = parseUpdateCustomerPayload({ creditAllowed: true });
    expect(result.creditAllowed).toBe(true);
  });

  it("rejects invalid orderMode", () => {
    expect(() => parseUpdateCustomerPayload({ orderMode: "invalid_mode" })).toThrow();
  });
});

describe("parseApproveOrderRequestPayload", () => {
  it("applies default paymentMethod when called with empty object", () => {
    const result = parseApproveOrderRequestPayload({});
    expect(result.paymentMethod).toBe("direct_bank_transfer");
    expect(result.approvalNote).toBe("");
  });
});

describe("parseUpdateB2BOrderStatusPayload", () => {
  it("accepts valid order status", () => {
    const result = parseUpdateB2BOrderStatusPayload({ orderStatus: "delivered" });
    expect(result.orderStatus).toBe("delivered");
  });

  it("rejects unknown order status", () => {
    expect(() => parseUpdateB2BOrderStatusPayload({ orderStatus: "flying" })).toThrow();
  });

  it("throws when payload is null", () => {
    expect(() => parseUpdateB2BOrderStatusPayload(null)).toThrow();
  });
});
