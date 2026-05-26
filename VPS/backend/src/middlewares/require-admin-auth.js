const { HttpError } = require("../common/http-error");

const ALLOWED_ADMIN_ROLES = new Set(["super_admin", "staff"]);

function requireAdminAuth(req, _res, next) {
  if (!req.actor || !req.actor.id || !req.actor.role) {
    return next(
      new HttpError(
        401,
        "Admin authentication required. Use a valid Bearer access token."
      )
    );
  }

  if (!ALLOWED_ADMIN_ROLES.has(req.actor.role)) {
    return next(new HttpError(403, "Admin role is not authorized."));
  }

  return next();
}

module.exports = { requireAdminAuth };
