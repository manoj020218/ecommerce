import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./layout/admin-layout";
import { AuthGuard } from "../modules/auth/auth-guard";
import { BlogsPage } from "../modules/blogs/blogs-page";
import { LoginPage } from "../modules/auth/login-page";
import { CataloguePage } from "../modules/catalogue/catalogue-page";
import { CategoriesPage } from "../modules/categories/categories-page";
import { ProductsPage } from "../modules/products/products-page";
import { HsnTaxPage } from "../modules/hsn-tax/hsn-tax-page";
import { InventoryPage } from "../modules/inventory/inventory-page";
import { WebsiteLeadsPage } from "../modules/website-leads/website-leads-page";

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
          <Route path="blogs" element={<BlogsPage />} />
          <Route path="website-leads" element={<WebsiteLeadsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/catalogue" replace />} />
    </Routes>
  );
}
