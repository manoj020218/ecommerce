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

module.exports = { adminExportTallyCsv };
