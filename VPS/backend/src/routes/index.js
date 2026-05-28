const express = require("express");
const { createAuthRouter } = require("../modules/auth/auth.routes");
const { createCatalogueRouter } = require("../modules/catalogue/catalogue.routes");
const {
  createAdminCategoriesRouter,
  createPublicCategoriesRouter
} = require("../modules/categories/categories.routes");
const { createHsnTaxRouter } = require("../modules/hsn-tax/hsn-tax.routes");
const { createInventoryRouter } = require("../modules/inventory/inventory.routes");
const {
  createAdminProductsRouter,
  createPublicProductsRouter
} = require("../modules/products/products.routes");
const {
  createRolesPermissionsRouter
} = require("../modules/roles-permissions/roles-permissions.routes");
const { createStaffRouter } = require("../modules/staff/staff.routes");
const { createAuditLogsRouter } = require("../modules/audit-logs/audit-logs.routes");
const {
  createAdminSettingsRouter,
  createPublicSettingsRouter
} = require("../modules/settings/settings.routes");
const {
  createSearchRouter,
  createAdminSearchRouter
} = require("../modules/search/search.routes");
const {
  createCartRouter,
  createCheckoutRouter,
  createPaymentsRouter
} = require("../modules/cart-checkout/cart-checkout.routes");
const {
  createPaymentGatewaysRouter
} = require("../modules/payment-gateways/payment-gateways.routes");
const {
  createPublicManualPaymentsRouter,
  createAdminManualPaymentsRouter
} = require("../modules/manual-payments/manual-payments.routes");
const {
  createAdminShippingRouter,
  createPublicShippingRouter
} = require("../modules/shipping/shipping.routes");
const { createInvoicesRouter } = require("../modules/invoices/invoices.routes");
const { createTallyExportRouter } = require("../modules/tally-export/tally-export.routes");
const {
  createCustomerAccountRouter
} = require("../modules/customer-account/customer-account.routes");
const { createCustomersRouter } = require("../modules/customers/customers.routes");
const {
  createAdminAbandonedCartRouter,
  createPublicRecoveryRouter
} = require("../modules/abandoned-cart/abandoned-cart.routes");
const {
  createAdminBlogsRouter,
  createPublicBlogsRouter
} = require("../modules/blogs/blogs.routes");
const {
  createAdminWebsiteLeadsRouter,
  createPublicWebsiteLeadsRouter
} = require("../modules/website-leads/website-leads.routes");
const {
  createAdminMarketingRouter,
  createPublicMarketingRouter
} = require("../modules/marketing/marketing.routes");
const { createReportsRouter } = require("../modules/reports/reports.routes");

function createApiRouter() {
  const router = express.Router();

  router.use("/auth", createAuthRouter());
  router.use("/admin/roles-permissions", createRolesPermissionsRouter());
  router.use("/admin/staff", createStaffRouter());
  router.use("/admin/activity-logs", createAuditLogsRouter());
  router.use("/admin/catalogue", createCatalogueRouter());
  router.use("/admin/categories", createAdminCategoriesRouter());
  router.use("/admin/hsn-tax", createHsnTaxRouter());
  router.use("/admin/products", createAdminProductsRouter());
  router.use("/admin/inventory", createInventoryRouter());
  router.use("/admin/settings", createAdminSettingsRouter());
  router.use("/admin/search", createAdminSearchRouter());
  router.use("/categories", createPublicCategoriesRouter());
  router.use("/products", createPublicProductsRouter());
  router.use("/settings", createPublicSettingsRouter());
  router.use("/search", createSearchRouter());
  router.use("/cart", createCartRouter());
  router.use("/checkout", createCheckoutRouter());
  router.use("/payments", createPaymentsRouter());
  router.use("/payments/manual", createPublicManualPaymentsRouter());
  router.use("/customer/account", createCustomerAccountRouter());
  router.use("/admin/customers", createCustomersRouter());
  router.use("/admin/abandoned-carts", createAdminAbandonedCartRouter());
  router.use("/admin/payment-gateways", createPaymentGatewaysRouter());
  router.use("/admin/manual-payments", createAdminManualPaymentsRouter());
  router.use("/admin/invoices", createInvoicesRouter());
  router.use("/admin/tally-export", createTallyExportRouter());
  router.use("/admin/shipping", createAdminShippingRouter());
  router.use("/admin/blogs", createAdminBlogsRouter());
  router.use("/admin/website-leads", createAdminWebsiteLeadsRouter());
  router.use("/admin/marketing", createAdminMarketingRouter());
  router.use("/admin/reports", createReportsRouter());
  router.use("/shipping", createPublicShippingRouter());
  router.use("/recovery", createPublicRecoveryRouter());
  router.use("/blogs", createPublicBlogsRouter());
  router.use("/website-leads", createPublicWebsiteLeadsRouter());
  router.use("/marketing", createPublicMarketingRouter());

  return router;
}

const apiRouter = createApiRouter();

module.exports = { apiRouter };
