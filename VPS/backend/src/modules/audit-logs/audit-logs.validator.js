const { z } = require("zod");

const listAuditLogQuerySchema = z.object({
  actorId: z.string().trim().optional(),
  action: z.string().trim().optional(),
  resourceType: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

function parseListAuditLogQuery(query) {
  return listAuditLogQuerySchema.parse(query);
}

module.exports = { parseListAuditLogQuery };
