const { HttpError } = require("../common/http-error");

function hasPermission(actor, permission) {
  if (!actor || !permission) {
    return false;
  }

  if (actor.role === "super_admin") {
    return true;
  }

  return Array.isArray(actor.permissions) && actor.permissions.includes(permission);
}

function requireAdminPermission(permission) {
  return (req, _res, next) => {
    if (!hasPermission(req.actor, permission)) {
      return next(
        new HttpError(403, `Missing permission: ${permission}. Access denied.`)
      );
    }

    return next();
  };
}

module.exports = { hasPermission, requireAdminPermission };
