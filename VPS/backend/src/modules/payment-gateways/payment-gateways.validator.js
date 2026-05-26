const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const {
  GATEWAY_MODES,
  GATEWAY_TYPES
} = require("./payment-gateways.model");

const listGatewaysQuerySchema = z.object({
  gatewayType: z
    .enum([GATEWAY_TYPES.ONLINE, GATEWAY_TYPES.MANUAL])
    .optional(),
  includeDisabled: z.coerce.boolean().optional().default(true)
});

const updateGatewayPayloadSchema = z
  .object({
    label: z.string().trim().min(2).max(140).optional(),
    isEnabled: z.boolean().optional(),
    priority: z.coerce.number().int().min(1).max(1000).optional(),
    mode: z.enum([GATEWAY_MODES.TEST, GATEWAY_MODES.LIVE]).optional(),
    minOrderValue: z.coerce.number().min(0).max(100000000).optional(),
    maxOrderValue: z.coerce.number().min(0).max(100000000).nullable().optional(),
    credentials: z.record(z.any()).optional(),
    instructions: z.record(z.any()).optional()
  })
  .refine(
    (payload) =>
      Object.keys(payload).length > 0 &&
      Object.values(payload).some((value) => value !== undefined),
    {
      message: "At least one gateway field must be provided."
    }
  );

const updateDirectDiscountPayloadSchema = z.object({
  enabled: z.boolean().optional(),
  percent: z.coerce.number().min(0).max(50).optional(),
  applicableMethods: z.array(z.string().trim().min(2).max(120)).optional()
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListGatewaysQuery(query) {
  return listGatewaysQuerySchema.parse(query || {});
}

function parseUpdateGatewayPayload(payload) {
  ensureObject(payload, "Update gateway");
  return updateGatewayPayloadSchema.parse(payload);
}

function parseUpdateDirectDiscountPayload(payload) {
  ensureObject(payload, "Update direct payment discount");
  return updateDirectDiscountPayloadSchema.parse(payload);
}

module.exports = {
  parseListGatewaysQuery,
  parseUpdateGatewayPayload,
  parseUpdateDirectDiscountPayload
};
