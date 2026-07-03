import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CustomerForgotPasswordPage } from "../modules/account/account-forgot-password-page";
import { CustomerAccountLoginPage } from "../modules/account/account-login-page";
import { CustomerAccountPage } from "../modules/account/account-page";
import { CustomerOrderPage } from "../modules/account/account-order-page";
import { CustomerResetPasswordPage } from "../modules/account/account-reset-password-page";
import { BlogPage } from "../modules/blogs/blog-page";
import { BlogsListPage } from "../modules/blogs/blogs-list-page";
import { CartPage } from "../modules/cart/cart-page";
import { CheckoutPage } from "../modules/cart/checkout-page";
import { OrderSuccessPage } from "../modules/cart/order-success-page";
import { ProductsListPage } from "../modules/products/products-list-page";
import { ProductPage } from "../modules/products/product-page";
import { StorefrontHomePage } from "../modules/products/storefront-home-page";
import { RecoveryPage } from "../modules/recovery/recovery-page";
import { NotFoundPage } from "../modules/settings/not-found-page";
import { StaticPage } from "../modules/static-pages/static-page";
import { GoogleCallbackPage } from "../modules/account/google-callback-page";
import { StorefrontLayout } from "../modules/settings/storefront-layout";
import { StorefrontLoadingState } from "../shared/storefront/storefront-ui";
import { useCustomerSession } from "../shared/auth/customer-session";

function CustomerProtectedRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated, loading } = useCustomerSession();

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading your customer session..." />
      </main>
    );
  }

  if (!isAuthenticated) {
    const redirectTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/account/login?redirect=${encodeURIComponent(redirectTo)}`}
        replace
      />
    );
  }

  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<StorefrontLayout />}>
        <Route path="/" element={<StorefrontHomePage />} />
        <Route path="/products" element={<ProductsListPage />} />
        <Route path="/categories/:slug" element={<ProductsListPage />} />
        <Route path="/guides" element={<BlogsListPage />} />
        <Route path="/guides/:slug" element={<BlogPage />} />
        <Route path="/products/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/success" element={<OrderSuccessPage />} />
        <Route path="/orders/guest/:checkoutSessionId" element={<OrderSuccessPage />} />
        <Route path="/recover/:recoveryToken" element={<RecoveryPage />} />
        <Route path="/pages/:slug" element={<StaticPage />} />
        <Route path="/about-us" element={<StaticPage />} />
        <Route path="/contact-us" element={<StaticPage />} />
        <Route path="/privacy-policy" element={<StaticPage />} />
        <Route path="/terms-and-conditions" element={<StaticPage />} />
        <Route path="/refund-policy" element={<StaticPage />} />
        <Route path="/shipping-policy" element={<StaticPage />} />
        <Route path="/account/login" element={<CustomerAccountLoginPage />} />
        <Route path="/account/google-callback" element={<GoogleCallbackPage />} />
        <Route path="/account/forgot-password" element={<CustomerForgotPasswordPage />} />
        <Route path="/account/reset-password" element={<CustomerResetPasswordPage />} />
        <Route
          path="/account"
          element={
            <CustomerProtectedRoute>
              <CustomerAccountPage />
            </CustomerProtectedRoute>
          }
        />
        <Route
          path="/account/orders/:orderId"
          element={
            <CustomerProtectedRoute>
              <CustomerOrderPage />
            </CustomerProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
