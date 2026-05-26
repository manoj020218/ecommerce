const { z } = require("zod");

const exportProductsQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(false)
});

function parseExportProductsQuery(query) {
  return exportProductsQuerySchema.parse(query || {});
}

module.exports = { parseExportProductsQuery };
