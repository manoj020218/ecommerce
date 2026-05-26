export function hasPermission(session, permission) {
  if (!permission) {
    return true;
  }

  const admin = session?.admin;
  if (!admin) {
    return false;
  }

  if (admin.role === "super_admin") {
    return true;
  }

  const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];
  return permissions.includes(permission) || permissions.includes("*");
}
