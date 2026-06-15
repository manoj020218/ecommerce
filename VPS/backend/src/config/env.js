const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const portRaw = process.env.PORT || "4100";
const port = Number.parseInt(portRaw, 10);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${portRaw}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}`,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "30d",
  allowHeaderAuthFallback: process.env.ALLOW_HEADER_AUTH_FALLBACK === "true",
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || "admin@jenixindia.com",
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || "ChangeMe@123",
  uploadDir: process.env.UPLOAD_DIR || "backend/uploads",
  settingsStorePath:
    process.env.SETTINGS_STORE_PATH || "backend/src/database/json/settings.json",
  settingsAuditPath:
    process.env.SETTINGS_AUDIT_PATH ||
    "backend/src/database/json/settings-audit-log.json",
  authStorePath:
    process.env.AUTH_STORE_PATH || "backend/src/database/json/auth-store.json",
  catalogStorePath:
    process.env.CATALOG_STORE_PATH || "backend/src/database/json/catalog-store.json",
  paymentStorePath:
    process.env.PAYMENT_STORE_PATH || "backend/src/database/json/payment-store.json",
  recoveryStorePath:
    process.env.RECOVERY_STORE_PATH || "backend/src/database/json/recovery-store.json",
  invoiceStorePath:
    process.env.INVOICE_STORE_PATH || "backend/src/database/json/invoice-store.json",
  shippingStorePath:
    process.env.SHIPPING_STORE_PATH || "backend/src/database/json/shipping-store.json",
  searchStorePath:
    process.env.SEARCH_STORE_PATH || "backend/src/database/json/search-store.json",
  contentStorePath:
    process.env.CONTENT_STORE_PATH || "backend/src/database/json/content-store.json",
  websiteLeadsStorePath:
    process.env.WEBSITE_LEADS_STORE_PATH ||
    "backend/src/database/json/website-leads-store.json",
  marketingStorePath:
    process.env.MARKETING_STORE_PATH ||
    "backend/src/database/json/marketing-store.json",
  integrationsStorePath:
    process.env.INTEGRATIONS_STORE_PATH ||
    "backend/src/database/json/integrations-store.json",
  otpDevDefaultCode: process.env.OTP_DEV_DEFAULT_CODE || "123456",
  cartStockReservationMinutes: Number.parseInt(
    process.env.CART_STOCK_RESERVATION_MINUTES || "15",
    10
  ),
  maxUploadSizeBytes: Number.parseInt(
    process.env.MAX_UPLOAD_SIZE_BYTES || `${5 * 1024 * 1024}`,
    10
  )
};

module.exports = { env };
