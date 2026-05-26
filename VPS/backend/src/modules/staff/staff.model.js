const STAFF_ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  STAFF: "staff"
});

function sanitizeStaffUser(staffUser) {
  const { passwordHash, ...safe } = staffUser;
  void passwordHash;
  return safe;
}

module.exports = { STAFF_ROLES, sanitizeStaffUser };
