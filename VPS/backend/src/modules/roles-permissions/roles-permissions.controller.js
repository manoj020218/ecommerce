const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./roles-permissions.service");
const {
  parseCreateGroupPayload,
  parseUpdateGroupPayload
} = require("./roles-permissions.validator");

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

const adminListPermissionGroups = asyncHandler(async (_req, res) => {
  const data = await service.listPermissionGroups();
  return ok(res, data, "Permission groups fetched.");
});

const adminGetPermissionGroup = asyncHandler(async (req, res) => {
  const data = await service.getPermissionGroupById(req.params.groupId);
  return ok(res, data, "Permission group fetched.");
});

const adminCreatePermissionGroup = asyncHandler(async (req, res) => {
  const payload = parseCreateGroupPayload(req.body);
  const data = await service.createPermissionGroup(payload, req.actor);
  return created(res, data, "Permission group created.");
});

const adminUpdatePermissionGroup = asyncHandler(async (req, res) => {
  const patch = parseUpdateGroupPayload(req.body);
  const data = await service.updatePermissionGroup(
    req.params.groupId,
    patch,
    req.actor
  );
  return ok(res, data, "Permission group updated.");
});

const adminListAvailablePermissions = asyncHandler(async (_req, res) => {
  return ok(
    res,
    {
      permissions: service.availablePermissions
    },
    "Available permissions fetched."
  );
});

module.exports = {
  adminListPermissionGroups,
  adminGetPermissionGroup,
  adminCreatePermissionGroup,
  adminUpdatePermissionGroup,
  adminListAvailablePermissions
};
