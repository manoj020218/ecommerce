const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const portRaw = process.env.PORT || "4100";
const port = Number.parseInt(portRaw, 10);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${portRaw}`);
}

const nodeEnv = process.env.NODE_ENV || "development";
const DEV_JWT_ACCESS_SECRET = "dev_access_secret_change_me";
const DEV_JWT_REFRESH_SECRET = "dev_refresh_secret_change_me";

const env = {
  nodeEnv,
  port,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}`,
  // publicBaseUrl is api.jenixindia.com in production (correct for backend
  // asset URLs like /static/uploads/...), but customer-facing SPA routes
  // (/recover/:token, /orders/guest/:id, etc.) live on the storefront
  // domain, not the API subdomain — api.jenixindia.com/orders/guest/... is
  // a 404, confirmed live. Links built for a customer to click must use
  // this instead.
  storefrontBaseUrl: process.env.STOREFRONT_BASE_URL || `http://localhost:${port}`,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || DEV_JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || DEV_JWT_REFRESH_SECRET,
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "30d",
  // Hard-gated in code, not just via env: this header-identity fallback must never be
  // reachable in production no matter how ALLOW_HEADER_AUTH_FALLBACK is set in .env.
  allowHeaderAuthFallback:
    nodeEnv !== "production" && process.env.ALLOW_HEADER_AUTH_FALLBACK === "true",
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || "admin@jenixindia.com",
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || "ChangeMe@123",
  uploadDir: process.env.UPLOAD_DIR || "image-assets/uploads",
  migrationImagesDir: process.env.MIGRATION_IMAGES_DIR || "image-assets/migration",
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
  jobVacanciesStorePath:
    process.env.JOB_VACANCIES_STORE_PATH ||
    "backend/src/database/json/job-vacancies-store.json",
  websiteLeadsStorePath:
    process.env.WEBSITE_LEADS_STORE_PATH ||
    "backend/src/database/json/website-leads-store.json",
  marketingStorePath:
    process.env.MARKETING_STORE_PATH ||
    "backend/src/database/json/marketing-store.json",
  integrationsStorePath:
    process.env.INTEGRATIONS_STORE_PATH ||
    "backend/src/database/json/integrations-store.json",
  staticPagesStorePath:
    process.env.STATIC_PAGES_STORE_PATH ||
    "backend/src/database/json/static-pages-store.json",
  reviewStorePath:
    process.env.REVIEW_STORE_PATH || "backend/src/database/json/review-store.json",
  partnerStorePath:
    process.env.PARTNER_STORE_PATH || "backend/src/database/json/partner-store.json",
  printStorePath:
    process.env.PRINT_STORE_PATH || "backend/src/database/json/print-store.json",
  // Deliberately NOT under uploadDir -- that whole tree is mounted publicly
  // at /static/uploads (see app.js). Customer print-design uploads often
  // carry a real name/photo/employee ID and must only ever be served
  // through the authenticated admin route, never a public static mount.
  printUploadsDir:
    process.env.PRINT_UPLOADS_DIR || "image-assets/print-uploads",
  frontDistIndexPath:
    process.env.FRONT_DIST_INDEX_PATH || "apps/front/dist/index.html",
  otpDevDefaultCode: process.env.OTP_DEV_DEFAULT_CODE || "123456",
  // 15min was too tight against real-world UPI/net-banking flows (bank OTP,
  // 3D-secure redirect, app-switch to read an SMS routinely eat 5-10min on
  // their own) -- letting it expire mid-payment is what let a customer get
  // charged with no order ever created. 25min gives realistic headroom.
  cartStockReservationMinutes: Number.parseInt(
    process.env.CART_STOCK_RESERVATION_MINUTES || "25",
    10
  ),
  maxUploadSizeBytes: Number.parseInt(
    process.env.MAX_UPLOAD_SIZE_BYTES || `${5 * 1024 * 1024}`,
    10
  ),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4174,http://localhost:4100"
};

if (nodeEnv === "production") {
  // If the real secret failed to load (wrong CWD, PM2 restart without env, etc.), the
  // backend must refuse to start rather than silently sign/accept tokens using a
  // fallback value that is published in source control.
  if (env.jwtAccessSecret === DEV_JWT_ACCESS_SECRET || env.jwtAccessSecret.length < 32) {
    throw new Error(
      "Refusing to start in production with a missing/weak JWT_ACCESS_SECRET (must be a real secret, 32+ chars)."
    );
  }
  if (env.jwtRefreshSecret === DEV_JWT_REFRESH_SECRET || env.jwtRefreshSecret.length < 32) {
    throw new Error(
      "Refusing to start in production with a missing/weak JWT_REFRESH_SECRET (must be a real secret, 32+ chars)."
    );
  }
}

module.exports = { env };
