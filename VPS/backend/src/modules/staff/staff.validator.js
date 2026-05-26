const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(150),
  mobile: z.string().trim().max(20).optional().default(""),
  password: z.string().min(8).max(120),
  permissionGroupId: z.string().trim().min(3).max(150),
  isActive: z.boolean().optional().default(true)
});

const updateStaffSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  mobile: z.string().trim().max(20).optional(),
  permissionGroupId: z.string().trim().min(3).max(150).optional(),
  isActive: z.boolean().optional()
});

const updateStaffPasswordSchema = z.object({
  newPassword: z.string().min(8).max(120)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseCreateStaffPayload(payload) {
  ensureObject(payload, "Create staff");
  return createStaffSchema.parse(payload);
}

function parseUpdateStaffPayload(payload) {
  ensureObject(payload, "Update staff");
  return updateStaffSchema.parse(payload);
}

function parseUpdateStaffPasswordPayload(payload) {
  ensureObject(payload, "Update staff password");
  return updateStaffPasswordSchema.parse(payload);
}

module.exports = {
  parseCreateStaffPayload,
  parseUpdateStaffPayload,
  parseUpdateStaffPasswordPayload
};
