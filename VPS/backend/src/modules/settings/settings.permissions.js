const { HttpError } = require("../../common/http-error");

const SETTINGS_PERMISSIONS = Object.freeze({
  VIEW: "settings.view",
  EDIT: "settings.edit"
});

function hasPermission(actor, permission) {
  if (!actor) {
    return false;
  }

  if (actor.role === "super_admin") {
    return true;
  }

  return actor.permissions.includes(permission);
}

function ensurePermission(permission) {
  return (req, _res, next) => {
    if (!hasPermission(req.actor, permission)) {
      return next(
        new HttpError(403, `Missing permission: ${permission}. Access denied.`)
      );
    }
    return next();
  };
}

function ensureSuperAdminForCustomCode(req, _res, next) {
  if (!req.actor || req.actor.role !== "super_admin") {
    return next(
      new HttpError(403, "Only Super Admin can edit custom code or tracking tags.")
    );
  }

  return next();
}

module.exports = {
  SETTINGS_PERMISSIONS,
  hasPermission,
  ensurePermission,
  ensureSuperAdminForCustomCode
};
