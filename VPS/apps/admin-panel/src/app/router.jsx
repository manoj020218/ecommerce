import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./layout/admin-layout";
import { AuthGuard } from "../modules/auth/auth-guard";
import { ActivityLogsPage } from "../modules/activity-logs/activity-logs-page";
import { AbandonedCartsPage } from "../modules/abandoned-carts/abandoned-carts-page";
import { BlogsPage } from "../modules/blogs/blogs-page";
import { LoginPage } from "../modules/auth/login-page";
import { CataloguePage } from "../modules/catalogue/catalogue-page";
import { CategoriesPage } from "../modules/categories/categories-page";
import { CustomersPage } from "../modules/customers/customers-page";
import { FacebookFeedPage } from "../modules/facebook-feed/facebook-feed-page";
import { GoogleMerchantPage } from "../modules/google-merchant/google-merchant-page";
import { ProductsPage } from "../modules/products/products-page";
import { HsnTaxPage } from "../modules/hsn-tax/hsn-tax-page";
import { InventoryPage } from "../modules/inventory/inventory-page";
import { InvoicesPage } from "../modules/invoices/invoices-page";
import { MarketingPage } from "../modules/marketing/marketing-page";
import { OrdersPage } from "../modules/orders/orders-page";
import { PaymentGatewaysPage } from "../modules/payment-gateways/payment-gateways-page";
import { PermissionGroupsPage } from "../modules/permission-groups/permission-groups-page";
import { ReportsPage } from "../modules/reports/reports-page";
import { SearchPage } from "../modules/search/search-page";
import { SeoPage } from "../modules/seo/seo-page";
import { SettingsPage } from "../modules/settings/settings-page";
import { SetupWizardPage } from "../modules/setup-wizard/setup-wizard-page";
import { ShippingPage } from "../modules/shipping/shipping-page";
import { StaffPage } from "../modules/staff/staff-page";
import { TallyExportPage } from "../modules/tally-export/tally-export-page";
import { WalkInOrdersPage } from "../modules/walkin-orders/walkin-orders-page";
import { WebsiteLeadsPage } from "../modules/website-leads/website-leads-page";
import { IntegrationsPage } from "../modules/integrations/integrations-page";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AuthGuard />}>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Navigate to="/catalogue" replace />} />
          <Route path="catalogue" element={<CataloguePage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="hsn-tax" element={<HsnTaxPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="walk-in-orders" element={<WalkInOrdersPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="tally-export" element={<TallyExportPage />} />
          <Route path="shipping" element={<ShippingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="audit-logs" element={<ActivityLogsPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="permission-groups" element={<PermissionGroupsPage />} />
          <Route path="payment-gateways" element={<PaymentGatewaysPage />} />
          <Route path="blogs" element={<BlogsPage />} />
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="abandoned-carts" element={<AbandonedCartsPage />} />
          <Route path="google-merchant" element={<GoogleMerchantPage />} />
          <Route path="facebook-feed" element={<FacebookFeedPage />} />
          <Route path="website-leads" element={<WebsiteLeadsPage />} />
          <Route path="setup-wizard" element={<SetupWizardPage />} />
          <Route path="seo" element={<SeoPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/catalogue" replace />} />
    </Routes>
  );
}
