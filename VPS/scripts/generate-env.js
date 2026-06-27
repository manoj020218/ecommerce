#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

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

function normalizeUrl(value, fallback) {
  const input = String(value || fallback || "").trim();
  if (!input) {
    return "";
  }

  return input.replace(/\/+$/, "");
}

function generateSecret(length = 48) {
  return crypto.randomBytes(length).toString("hex");
}

function toEnvDocument(entries) {
  return Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
    .concat("\n");
}

async function ensureWritableOutput(filePath, force) {
  try {
    await fs.access(filePath);
    if (!force) {
      throw new Error(`Refusing to overwrite existing file: ${filePath}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    if (String(error.message || "").includes("Refusing to overwrite")) {
      throw error;
    }
  }
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf-8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const outputPath = path.resolve(cwd, args.output || ".env");
  const frontOutputPath = path.resolve(
    cwd,
    args["front-output"] || "apps/front/.env.production"
  );
  const adminOutputPath = path.resolve(
    cwd,
    args["admin-output"] || "apps/admin-panel/.env.production"
  );
  const force = args.force === "true";
  const dryRun = args["dry-run"] === "true";

  const port = Number.parseInt(args.port || "4100", 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid --port value: ${args.port || ""}`);
  }

  const apiDomain = normalizeUrl(args["api-domain"], `http://localhost:${port}`);
  const storeDomain = normalizeUrl(
    args["store-domain"],
    "https://businessdomain.com"
  );
  const adminDomain = normalizeUrl(
    args["admin-domain"],
    "https://admin.businessdomain.com"
  );
  const publicBaseUrl = apiDomain || `http://localhost:${port}`;
  const viteApiBaseUrl = `${publicBaseUrl}/api`;

  const envEntries = {
    NODE_ENV: args["node-env"] || "production",
    PORT: String(port),
    API_BASE_URL: viteApiBaseUrl,
    PUBLIC_BASE_URL: publicBaseUrl,
    STORE_DOMAIN: storeDomain,
    ADMIN_DOMAIN: adminDomain,
    API_DOMAIN: publicBaseUrl,
    JWT_ACCESS_SECRET: args["jwt-access-secret"] || generateSecret(32),
    JWT_REFRESH_SECRET: args["jwt-refresh-secret"] || generateSecret(32),
    JWT_ACCESS_TTL: args["jwt-access-ttl"] || "15m",
    JWT_REFRESH_TTL: args["jwt-refresh-ttl"] || "30d",
    ALLOW_HEADER_AUTH_FALLBACK: "false",
    OTP_DEV_DEFAULT_CODE: args["otp-dev-code"] || "123456",
    CART_STOCK_RESERVATION_MINUTES: args["cart-reservation-minutes"] || "15",
    CORS_ORIGIN: args["cors-origin"] || `${storeDomain},${adminDomain}`,
    MONGODB_URI:
      args["mongodb-uri"] || "mongodb://127.0.0.1:27017/jenix_commerce",
    SETTINGS_STORE_PATH:
      args["settings-store-path"] || "backend/src/database/json/settings.json",
    SETTINGS_AUDIT_PATH:
      args["settings-audit-path"] ||
      "backend/src/database/json/settings-audit-log.json",
    AUTH_STORE_PATH:
      args["auth-store-path"] || "backend/src/database/json/auth-store.json",
    CATALOG_STORE_PATH:
      args["catalog-store-path"] ||
      "backend/src/database/json/catalog-store.json",
    PAYMENT_STORE_PATH:
      args["payment-store-path"] ||
      "backend/src/database/json/payment-store.json",
    RECOVERY_STORE_PATH:
      args["recovery-store-path"] ||
      "backend/src/database/json/recovery-store.json",
    INVOICE_STORE_PATH:
      args["invoice-store-path"] ||
      "backend/src/database/json/invoice-store.json",
    SHIPPING_STORE_PATH:
      args["shipping-store-path"] ||
      "backend/src/database/json/shipping-store.json",
    SEARCH_STORE_PATH:
      args["search-store-path"] || "backend/src/database/json/search-store.json",
    CONTENT_STORE_PATH:
      args["content-store-path"] ||
      "backend/src/database/json/content-store.json",
    WEBSITE_LEADS_STORE_PATH:
      args["website-leads-store-path"] ||
      "backend/src/database/json/website-leads-store.json",
    MARKETING_STORE_PATH:
      args["marketing-store-path"] ||
      "backend/src/database/json/marketing-store.json",
    UPLOAD_DIR: args["upload-dir"] || "image-assets/uploads",
    MIGRATION_IMAGES_DIR: args["migration-images-dir"] || "image-assets/migration",
    SUPER_ADMIN_EMAIL:
      args["super-admin-email"] || "admin@businessdomain.com",
    SUPER_ADMIN_PASSWORD:
      args["super-admin-password"] || "ChangeMe@123",
    PAYMENT_PROVIDER: args["payment-provider"] || "",
    SHIPPING_PROVIDER: args["shipping-provider"] || "",
    OTP_PROVIDER: args["otp-provider"] || "",
    EMAIL_PROVIDER: args["email-provider"] || "",
    ANALYTICS_PROVIDER: args["analytics-provider"] || "",
    BACKUP_DIR: args["backup-dir"] || "backups",
    BACKUP_RETENTION_DAYS: args["backup-retention-days"] || "14",
    BACKUP_CRON: args["backup-cron"] || "0 2 * * *",
    LETSENCRYPT_EMAIL:
      args["letsencrypt-email"] || "admin@businessdomain.com"
  };

  const frontEntries = {
    VITE_API_BASE_URL: viteApiBaseUrl
  };

  const adminEntries = {
    VITE_API_BASE_URL: viteApiBaseUrl
  };

  if (!dryRun) {
    await ensureWritableOutput(outputPath, force);
    await ensureWritableOutput(frontOutputPath, force);
    await ensureWritableOutput(adminOutputPath, force);

    await writeText(outputPath, toEnvDocument(envEntries));
    await writeText(frontOutputPath, toEnvDocument(frontEntries));
    await writeText(adminOutputPath, toEnvDocument(adminEntries));
  }

  const summary = {
    outputPath,
    frontOutputPath,
    adminOutputPath,
    publicBaseUrl,
    viteApiBaseUrl,
    storeDomain,
    adminDomain,
    dryRun
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
