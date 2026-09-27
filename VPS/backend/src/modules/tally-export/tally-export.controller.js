const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./tally-export.service");
const { parseTallyExportQuery } = require("./tally-export.validator");

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

const adminExportTallyCsv = asyncHandler(async (req, res) => {
  const filters = parseTallyExportQuery(req.query || {});
  const data = await service.exportInvoicesAsTallyCsv(filters, req.actor);
  return ok(res, data, "Tally export generated.");
});

const adminListTallyExportHistory = asyncHandler(async (req, res) => {
  const data = await service.listTallyExportHistory();
  return ok(res, data, "Tally export history loaded.");
});

const adminDownloadTallyExport = asyncHandler(async (req, res) => {
  const { fileName, csv } = await service.getTallyExportDownload(req.params.exportId);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.status(200).send(csv);
});

module.exports = { adminExportTallyCsv, adminListTallyExportHistory, adminDownloadTallyExport };
