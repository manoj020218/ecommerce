const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./staff.service");
const {
  parseCreateStaffPayload,
  parseUpdateStaffPayload,
  parseUpdateStaffPasswordPayload
} = require("./staff.validator");

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

const adminListStaffUsers = asyncHandler(async (_req, res) => {
  const data = await service.listStaffUsers();
  return ok(res, data, "Staff users fetched.");
});

const adminCreateStaffUser = asyncHandler(async (req, res) => {
  const payload = parseCreateStaffPayload(req.body);
  const data = await service.createStaffUser(payload, req.actor);
  return created(res, data, "Staff user created.");
});

const adminUpdateStaffUser = asyncHandler(async (req, res) => {
  const patch = parseUpdateStaffPayload(req.body);
  const data = await service.updateStaffUser(req.params.staffId, patch, req.actor);
  return ok(res, data, "Staff user updated.");
});

const adminUpdateStaffPassword = asyncHandler(async (req, res) => {
  const payload = parseUpdateStaffPasswordPayload(req.body);
  const data = await service.updateStaffPassword(
    req.params.staffId,
    payload.newPassword,
    req.actor
  );
  return ok(res, data, "Staff password updated.");
});

module.exports = {
  adminListStaffUsers,
  adminCreateStaffUser,
  adminUpdateStaffUser,
  adminUpdateStaffPassword
};
