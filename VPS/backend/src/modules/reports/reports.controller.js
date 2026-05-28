const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./reports.service");
const {
  parseReportExportQuery,
  parseReportFilters,
  parseReportKey
} = require("./reports.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", { issues: error.issues });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(mapValidationError(error));
    }
  };
}

const adminGetReport = asyncHandler(async (req, res) => {
  const reportKey = parseReportKey(req.params.reportKey);
  const filters = parseReportFilters(req.query || {});
  return ok(res, await service.getReport(reportKey, filters), "Report generated.");
});

const adminExportReport = asyncHandler(async (req, res) => {
  const reportKey = parseReportKey(req.params.reportKey);
  const query = parseReportExportQuery(req.query || {});
  const data = await service.exportReport(reportKey, query, req.actor, query.format);

  res.setHeader("Content-Type", data.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${data.fileName}"`);
  res.status(200).send(data.content);
});

module.exports = {
  adminGetReport,
  adminExportReport
};
