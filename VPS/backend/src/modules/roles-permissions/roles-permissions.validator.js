const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const permissionSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(
    /^[a-z0-9-]+\.[a-z0-9_]+$|^\*$/,
    "Permission format must look like module.action"
  );

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional().default(""),
  permissions: z.array(permissionSchema).min(1)
});

const updateGroupSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(400).optional(),
  permissions: z.array(permissionSchema).min(1).optional()
});

function parseCreateGroupPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Permission group payload must be an object.");
  }
  return createGroupSchema.parse(payload);
}

function parseUpdateGroupPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Permission group payload must be an object.");
  }
  return updateGroupSchema.parse(payload);
}

module.exports = { parseCreateGroupPayload, parseUpdateGroupPayload };
