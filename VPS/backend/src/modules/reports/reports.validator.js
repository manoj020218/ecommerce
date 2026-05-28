const { z } = require("zod");
const { REPORT_KEYS, REPORT_EXPORT_FORMATS } = require("./reports.model");

const reportKeySchema = z.enum(REPORT_KEYS);

const reportFiltersSchema = z.object({
  period: z.enum(["monthly", "yearly", "custom"]).optional().default("monthly"),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  city: z.string().trim().max(120).optional().default(""),
  pincode: z.string().trim().max(20).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  courier: z.string().trim().max(120).optional().default(""),
  customerType: z.string().trim().max(80).optional().default(""),
  paymentStatus: z.string().trim().max(80).optional().default(""),
  orderStatus: z.string().trim().max(80).optional().default(""),
  shipmentStatus: z.string().trim().max(80).optional().default(""),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(500)
});

const reportExportQuerySchema = reportFiltersSchema.extend({
  format: z.enum(REPORT_EXPORT_FORMATS).optional().default("csv")
});

function parseReportKey(value) {
  return reportKeySchema.parse(value);
}

function parseReportFilters(query) {
  return reportFiltersSchema.parse(query || {});
}

function parseReportExportQuery(query) {
  return reportExportQuerySchema.parse(query || {});
}

module.exports = {
  parseReportKey,
  parseReportFilters,
  parseReportExportQuery
};
