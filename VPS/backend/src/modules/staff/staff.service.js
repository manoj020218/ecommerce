const bcrypt = require("bcryptjs");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const {
  ensureDefaultGroups
} = require("../roles-permissions/roles-permissions.service");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { AUDIT_LOG_ACTIONS } = require("../audit-logs/audit-logs.model");
const { STAFF_ROLES, sanitizeStaffUser } = require("./staff.model");

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function resolvePermissionGroup(store, groupId) {
  const group = store.permissionGroups.find((item) => item.id === groupId);
  if (!group) {
    throw new HttpError(400, "Invalid permissionGroupId.");
  }
  return group;
}

async function listStaffUsers() {
  const store = await readAuthStore();
  const seeded = await ensureDefaultGroups(store);
  if (seeded) {
    await writeAuthStore(store);
  }

  return store.staffUsers.map((item) => {
    const group =
      store.permissionGroups.find((g) => g.id === item.permissionGroupId) || null;
    return {
      ...sanitizeStaffUser(item),
      permissionGroup: group
        ? {
            id: group.id,
            name: group.name,
            slug: group.slug
          }
        : null
    };
  });
}

async function createStaffUser(payload, actor) {
  const store = await readAuthStore();
  const seeded = await ensureDefaultGroups(store);
  if (seeded) {
    await writeAuthStore(store);
  }

  const normalizedEmail = normalizeEmail(payload.email);
  const duplicate = store.staffUsers.find(
    (staff) => normalizeEmail(staff.email) === normalizedEmail
  );
  if (duplicate) {
    throw new HttpError(409, "Staff email already exists.");
  }

  const group = resolvePermissionGroup(store, payload.permissionGroupId);
  if (group.id === "group_super_admin") {
    throw new HttpError(400, "Super Admin group cannot be assigned to staff.");
  }

  const now = new Date().toISOString();
  const staffUser = {
    id: generateId("staff"),
    role: STAFF_ROLES.STAFF,
    name: payload.name,
    email: normalizedEmail,
    mobile: payload.mobile || "",
    passwordHash: await bcrypt.hash(payload.password, 10),
    permissionGroupId: payload.permissionGroupId,
    isActive: payload.isActive,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };

  store.staffUsers.push(staffUser);
  await writeAuthStore(store);

  await addActivityLog({
    action: AUDIT_LOG_ACTIONS.STAFF_CREATED,
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "staff_user",
    resourceId: staffUser.id,
    metadata: {
      permissionGroupId: staffUser.permissionGroupId,
      email: staffUser.email
    }
  });

  return sanitizeStaffUser(staffUser);
}

async function updateStaffUser(staffUserId, patch, actor) {
  const store = await readAuthStore();
  const seeded = await ensureDefaultGroups(store);
  if (seeded) {
    await writeAuthStore(store);
  }

  const index = store.staffUsers.findIndex((user) => user.id === staffUserId);
  if (index < 0) {
    throw new HttpError(404, "Staff user not found.");
  }

  const existing = store.staffUsers[index];
  if (existing.role === STAFF_ROLES.SUPER_ADMIN) {
    throw new HttpError(403, "Super Admin user cannot be modified from staff API.");
  }

  if (patch.permissionGroupId) {
    const group = resolvePermissionGroup(store, patch.permissionGroupId);
    if (group.id === "group_super_admin") {
      throw new HttpError(400, "Super Admin group cannot be assigned to staff.");
    }
  }

  const updated = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  store.staffUsers[index] = updated;
  await writeAuthStore(store);

  await addActivityLog({
    action: AUDIT_LOG_ACTIONS.STAFF_UPDATED,
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "staff_user",
    resourceId: updated.id,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeStaffUser(updated);
}

async function updateStaffPassword(staffUserId, newPassword, actor) {
  const store = await readAuthStore();
  const seeded = await ensureDefaultGroups(store);
  if (seeded) {
    await writeAuthStore(store);
  }

  const index = store.staffUsers.findIndex((user) => user.id === staffUserId);
  if (index < 0) {
    throw new HttpError(404, "Staff user not found.");
  }

  const existing = store.staffUsers[index];
  if (existing.role === STAFF_ROLES.SUPER_ADMIN) {
    throw new HttpError(
      403,
      "Super Admin password should be changed from secure flow."
    );
  }

  const updated = {
    ...existing,
    passwordHash: await bcrypt.hash(newPassword, 10),
    updatedAt: new Date().toISOString()
  };
  store.staffUsers[index] = updated;
  await writeAuthStore(store);

  await addActivityLog({
    action: AUDIT_LOG_ACTIONS.STAFF_PASSWORD_UPDATED,
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "staff_user",
    resourceId: updated.id
  });

  return sanitizeStaffUser(updated);
}

async function findStaffUserByEmail(email) {
  const store = await readAuthStore();
  const seeded = await ensureDefaultGroups(store);
  if (seeded) {
    await writeAuthStore(store);
  }

  return (
    store.staffUsers.find(
      (staffUser) => normalizeEmail(staffUser.email) === normalizeEmail(email)
    ) || null
  );
}

async function touchStaffLastLogin(staffUserId) {
  const store = await readAuthStore();
  const index = store.staffUsers.findIndex((user) => user.id === staffUserId);
  if (index < 0) {
    return null;
  }

  store.staffUsers[index] = {
    ...store.staffUsers[index],
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await writeAuthStore(store);
  return store.staffUsers[index];
}

module.exports = {
  listStaffUsers,
  createStaffUser,
  updateStaffUser,
  updateStaffPassword,
  findStaffUserByEmail,
  touchStaffLastLogin
};
