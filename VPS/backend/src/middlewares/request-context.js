const { env } = require("../config/env");
const { verifyAccessToken } = require("../common/token-service");

function parsePermissions(rawPermissions) {
  if (!rawPermissions || typeof rawPermissions !== "string") {
    return [];
  }

  return rawPermissions
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);
}

function parseBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
}

function attachRequestContext(req, _res, next) {
  req.actor = null;
  req.customer = null;
  req.authTokenError = null;

  const bearerToken = parseBearerToken(req.header("authorization"));

  if (bearerToken) {
    try {
      const payload = verifyAccessToken(bearerToken);

      if (payload.actorType === "admin") {
        req.actor = {
          id: payload.sub,
          role: payload.role,
          email: payload.email,
          permissionGroupId: payload.permissionGroupId || null,
          permissions: Array.isArray(payload.permissions) ? payload.permissions : []
        };
      }

      if (payload.actorType === "customer") {
        req.customer = {
          id: payload.sub,
          email: payload.email || null,
          mobile: payload.mobile || null,
          verifiedEmail: Boolean(payload.verifiedEmail),
          verifiedMobile: Boolean(payload.verifiedMobile)
        };
      }
    } catch (error) {
      req.authTokenError = error;
    }
  }

  if (!req.actor && env.allowHeaderAuthFallback) {
    const adminId = req.header("x-admin-id") || null;
    const adminRole = req.header("x-admin-role") || null;
    const adminPermissions = parsePermissions(req.header("x-admin-permissions"));

    if (adminId && adminRole) {
      req.actor = {
        id: adminId,
        role: adminRole,
        permissions: adminPermissions
      };
    }
  }

  next();
}

module.exports = { attachRequestContext };
