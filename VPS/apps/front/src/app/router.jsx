import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StorefrontLayout } from "../modules/settings/storefront-layout";
import { StorefrontLoadingState } from "../shared/storefront/storefront-ui";
import { useCustomerSession } from "../shared/auth/customer-session";
// Home and product pages are bundled eagerly (not lazy) on purpose: they're
// the two highest-traffic routes and visitors bounce between them
// constantly (home -> product -> back to home, product -> another product,
// etc). Lazy-loading them meant every one of those navigations could show
// the generic Suspense "Loading..." fallback while that page's JS chunk
// downloaded for the first time in the session -- most noticeable
// navigating back to home from an SSR'd product page, which had something
// real to look at during its own chunk load and home didn't. The ~7KB
// gzipped cost of including both in the main bundle is worth it to remove
// that flash on the two routes people move through the most.
import { StorefrontHomePage } from "../modules/products/storefront-home-page";
import { ProductPage } from "../modules/products/product-page";

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

// /login is not a real route on this SPA -- our customer login page has
// always lived at /account/login. This exists purely to catch visitors
// arriving from a stale/incorrectly-indexed external link (confirmed via a
// real customer WhatsApp report: a Google Shopping/Search result with a
// srsltid tracking param pointing at /login) so they land on a working
// page instead of the 404. Preserves the query string in case it ever
// carries a meaningful param (e.g. ?redirect=...), not just Google's
// tracking noise.
function LoginRedirect() {
  const location = useLocation();
  return <Navigate to={`/account/login${location.search}`} replace />;
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
          <Route path="/login" element={<LoginRedirect />} />
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
