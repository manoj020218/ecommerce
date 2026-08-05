const { z } = require("zod");
const { booleanQueryParam } = require("../../common/zod-helpers");

const exportProductsQuerySchema = z.object({
  includeInactive: booleanQueryParam(false)
});

function parseExportProductsQuery(query) {
  return exportProductsQuerySchema.parse(query || {});
}

module.exports = { parseExportProductsQuery };
