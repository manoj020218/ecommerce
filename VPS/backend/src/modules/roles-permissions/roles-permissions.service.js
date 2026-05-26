const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const {
  AVAILABLE_PERMISSIONS,
  DEFAULT_PERMISSION_GROUPS
} = require("./roles-permissions.model");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { AUDIT_LOG_ACTIONS } = require("../audit-logs/audit-logs.model");

const availablePermissionsSet = new Set(AVAILABLE_PERMISSIONS);

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validatePermissionsOrThrow(permissions) {
  for (const permission of permissions) {
    if (permission === "*") {
      continue;
    }

    if (!availablePermissionsSet.has(permission)) {
      throw new HttpError(400, `Unknown permission: ${permission}`);
    }
  }
}

async function ensureDefaultGroups(store) {
  if (!Array.isArray(store.permissionGroups)) {
    store.permissionGroups = [];
  }

  if (store.permissionGroups.length > 0) {
    return false;
  }

  const now = new Date().toISOString();
  store.permissionGroups = DEFAULT_PERMISSION_GROUPS.map((group) => ({
    ...group,
    createdAt: now,
    updatedAt: now
  }));

  return true;
}

async function listPermissionGroups() {
  const store = await readAuthStore();
  const seeded = await ensureDefaultGroups(store);
  if (seeded) {
    await writeAuthStore(store);
  }

  return store.permissionGroups;
}

async function getPermissionGroupById(groupId) {
  const groups = await listPermissionGroups();
  const group = groups.find((item) => item.id === groupId);
  if (!group) {
    throw new HttpError(404, "Permission group not found.");
  }
  return group;
}

async function createPermissionGroup(payload, actor) {
  validatePermissionsOrThrow(payload.permissions);

  const store = await readAuthStore();
  await ensureDefaultGroups(store);

  const slug = slugify(payload.name);
  const duplicate = store.permissionGroups.find(
    (group) =>
      group.slug === slug || group.name.toLowerCase() === payload.name.toLowerCase()
  );
  if (duplicate) {
    throw new HttpError(409, "Permission group with same name already exists.");
  }

  const now = new Date().toISOString();
  const group = {
    id: generateId("perm_group"),
    name: payload.name,
    slug,
    description: payload.description || "",
    permissions: [...new Set(payload.permissions)],
    isSystem: false,
    createdAt: now,
    updatedAt: now
  };

  store.permissionGroups.push(group);
  await writeAuthStore(store);

  await addActivityLog({
    action: AUDIT_LOG_ACTIONS.PERMISSION_GROUP_CREATED,
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "permission_group",
    resourceId: group.id,
    metadata: {
      permissions: group.permissions
    }
  });

  return group;
}

async function updatePermissionGroup(groupId, patch, actor) {
  const store = await readAuthStore();
  await ensureDefaultGroups(store);

  const index = store.permissionGroups.findIndex((group) => group.id === groupId);
  if (index < 0) {
    throw new HttpError(404, "Permission group not found.");
  }

  const existing = store.permissionGroups[index];
  if (existing.isSystem) {
    throw new HttpError(403, "System permission groups cannot be modified.");
  }

  if (patch.permissions) {
    validatePermissionsOrThrow(patch.permissions);
  }

  const next = {
    ...existing,
    ...patch,
    slug: patch.name ? slugify(patch.name) : existing.slug,
    permissions: patch.permissions
      ? [...new Set(patch.permissions)]
      : existing.permissions,
    updatedAt: new Date().toISOString()
  };

  store.permissionGroups[index] = next;
  await writeAuthStore(store);

  await addActivityLog({
    action: AUDIT_LOG_ACTIONS.PERMISSION_GROUP_UPDATED,
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "permission_group",
    resourceId: next.id,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return next;
}

module.exports = {
  listPermissionGroups,
  getPermissionGroupById,
  createPermissionGroup,
  updatePermissionGroup,
  ensureDefaultGroups,
  availablePermissions: AVAILABLE_PERMISSIONS
};
