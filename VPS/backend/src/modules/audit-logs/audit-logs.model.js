const AUDIT_LOG_ACTIONS = Object.freeze({
  ADMIN_LOGIN_SUCCESS: "auth.admin.login.success",
  ADMIN_LOGIN_FAILED: "auth.admin.login.failed",
  STAFF_CREATED: "staff.user.created",
  STAFF_UPDATED: "staff.user.updated",
  STAFF_PASSWORD_UPDATED: "staff.user.password.updated",
  PERMISSION_GROUP_CREATED: "roles-permissions.group.created",
  PERMISSION_GROUP_UPDATED: "roles-permissions.group.updated"
});

module.exports = { AUDIT_LOG_ACTIONS };
