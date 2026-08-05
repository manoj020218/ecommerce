import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StorefrontLayout } from "../modules/settings/storefront-layout";
import { StorefrontLoadingState } from "../shared/storefront/storefront-ui";
import { useCustomerSession } from "../shared/auth/customer-session";

// Route-level code splitting — each page only downloads when a visitor
// actually navigates to it, instead of every page's JS shipping in one
// ~434KB bundle regardless of which single page was requested. Named
// exports (not default) is this codebase's convention throughout, so each
// lazy import maps the named export to `default` for React.lazy.
const CustomerForgotPasswordPage = lazy(() =>
  import("../modules/account/account-forgot-password-page").then((m) => ({
    default: m.CustomerForgotPasswordPage
  }))
);
const CustomerAccountLoginPage = lazy(() =>
  import("../modules/account/account-login-page").then((m) => ({
    default: m.CustomerAccountLoginPage
  }))
);
const CustomerAccountPage = lazy(() =>
  import("../modules/account/account-page").then((m) => ({
    default: m.CustomerAccountPage
  }))
);
const CustomerOrderPage = lazy(() =>
  import("../modules/account/account-order-page").then((m) => ({
    default: m.CustomerOrderPage
  }))
);
const CustomerResetPasswordPage = lazy(() =>
  import("../modules/account/account-reset-password-page").then((m) => ({
    default: m.CustomerResetPasswordPage
  }))
);
const BlogPage = lazy(() =>
  import("../modules/blogs/blog-page").then((m) => ({ default: m.BlogPage }))
);
const BlogsListPage = lazy(() =>
  import("../modules/blogs/blogs-list-page").then((m) => ({
    default: m.BlogsListPage
  }))
);
const CartPage = lazy(() =>
  import("../modules/cart/cart-page").then((m) => ({ default: m.CartPage }))
);
const CheckoutPage = lazy(() =>
  import("../modules/cart/checkout-page").then((m) => ({
    default: m.CheckoutPage
  }))
);
const OrderSuccessPage = lazy(() =>
  import("../modules/cart/order-success-page").then((m) => ({
    default: m.OrderSuccessPage
  }))
);
const ProductsListPage = lazy(() =>
  import("../modules/products/products-list-page").then((m) => ({
    default: m.ProductsListPage
  }))
);
const ProductPage = lazy(() =>
  import("../modules/products/product-page").then((m) => ({
    default: m.ProductPage
  }))
);
const StorefrontHomePage = lazy(() =>
  import("../modules/products/storefront-home-page").then((m) => ({
    default: m.StorefrontHomePage
  }))
);
const RecoveryPage = lazy(() =>
  import("../modules/recovery/recovery-page").then((m) => ({
    default: m.RecoveryPage
  }))
);
const NotFoundPage = lazy(() =>
  import("../modules/settings/not-found-page").then((m) => ({
    default: m.NotFoundPage
  }))
);
const StaticPage = lazy(() =>
  import("../modules/static-pages/static-page").then((m) => ({
    default: m.StaticPage
  }))
);
const GoogleCallbackPage = lazy(() =>
  import("../modules/account/google-callback-page").then((m) => ({
    default: m.GoogleCallbackPage
  }))
);

function RouteFallback() {
  return (
    <main className="proto-main-shell">
      <StorefrontLoadingState label="Loading..." />
    </main>
  );
}

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
    <Suspense fallback={<RouteFallback />}>
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
    </Suspense>
  );
}
