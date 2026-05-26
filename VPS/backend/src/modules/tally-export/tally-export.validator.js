const { z } = require("zod");
const { TALLY_EXPORT_PERIODS } = require("./tally-export.model");

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format");

const tallyExportQuerySchema = z.object({
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  period: z
    .enum([TALLY_EXPORT_PERIODS.MONTHLY, TALLY_EXPORT_PERIODS.YEARLY])
    .optional()
    .default(TALLY_EXPORT_PERIODS.MONTHLY)
});

function parseTallyExportQuery(query) {
  return tallyExportQuerySchema.parse(query || {});
}

module.exports = { parseTallyExportQuery };
