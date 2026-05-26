const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const { parseListAuditLogQuery } = require("./audit-logs.validator");
const { listActivityLogs } = require("./audit-logs.service");

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

const adminListAuditLogs = asyncHandler(async (req, res) => {
  const filters = parseListAuditLogQuery(req.query || {});
  const data = await listActivityLogs(filters);
  return ok(res, data, "Activity logs fetched.");
});

module.exports = { adminListAuditLogs };
