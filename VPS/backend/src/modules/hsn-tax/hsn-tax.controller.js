const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./hsn-tax.service");
const {
  parseListHsnQuery,
  parseCreateHsnPayload,
  parseUpdateHsnPayload
} = require("./hsn-tax.validator");

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

const adminListHsnRecords = asyncHandler(async (req, res) => {
  const filters = parseListHsnQuery(req.query || {});
  const data = await service.listHsnRecords(filters);
  return ok(res, data, "HSN records fetched.");
});

const adminGetHsnRecord = asyncHandler(async (req, res) => {
  const data = await service.getHsnRecord(req.params.hsnCode);
  return ok(res, data, "HSN record fetched.");
});

const adminCreateHsnRecord = asyncHandler(async (req, res) => {
  const payload = parseCreateHsnPayload(req.body);
  const data = await service.createHsnRecord(payload, req.actor);
  return created(res, data, "HSN record created.");
});

const adminUpdateHsnRecord = asyncHandler(async (req, res) => {
  const patch = parseUpdateHsnPayload(req.body);
  const data = await service.updateHsnRecord(req.params.hsnCode, patch, req.actor);
  return ok(res, data, "HSN record updated.");
});

const adminArchiveHsnRecord = asyncHandler(async (req, res) => {
  const data = await service.archiveHsnRecord(req.params.hsnCode, req.actor);
  return ok(res, data, "HSN record archived.");
});

module.exports = {
  adminListHsnRecords,
  adminGetHsnRecord,
  adminCreateHsnRecord,
  adminUpdateHsnRecord,
  adminArchiveHsnRecord
};
