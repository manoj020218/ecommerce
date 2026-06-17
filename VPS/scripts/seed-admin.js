#!/usr/bin/env node

const bcrypt = require("bcryptjs");
const { readAuthStore, writeAuthStore } = require("../backend/src/database/auth-store");
const {
  ensureDefaultGroups
} = require("../backend/src/modules/roles-permissions/roles-permissions.service");
const { generateId } = require("../backend/src/common/identity");
const { env } = require("../backend/src/config/env");

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = normalizeEmail(args.email || env.superAdminEmail);
  const password = String(args.password || env.superAdminPassword || "").trim();
  const name = String(args.name || "Super Admin").trim() || "Super Admin";
  const mobile = String(args.mobile || "").trim();

  if (!email) {
    throw new Error("Super admin email is required.");
  }
  if (!password) {
    throw new Error("Super admin password is required.");
  }

  const store = await readAuthStore();
  if (!Array.isArray(store.staffUsers)) {
    store.staffUsers = [];
  }
  await ensureDefaultGroups(store);

  const now = new Date().toISOString();
  const existing = store.staffUsers.find((user) => user.role === "super_admin");
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    existing.name = name;
    existing.email = email;
    existing.mobile = mobile;
    existing.passwordHash = passwordHash;
    existing.permissionGroupId = "group_super_admin";
    existing.isActive = true;
    existing.updatedAt = now;
  } else {
    store.staffUsers.push({
      id: generateId("staff"),
      role: "super_admin",
      name,
      email,
      mobile,
      permissionGroupId: "group_super_admin",
      passwordHash,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    });
  }

  await writeAuthStore(store);

  process.stdout.write(
    `${JSON.stringify(
      {
        email,
        name,
        mobile,
        created: !existing
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
