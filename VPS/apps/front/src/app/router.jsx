import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CustomerAccountLoginPage } from "../modules/account/account-login-page";
import { CustomerAccountPage } from "../modules/account/account-page";
import { CustomerOrderPage } from "../modules/account/account-order-page";
import { ProductsListPage } from "../modules/products/products-list-page";
import { ProductPage } from "../modules/products/product-page";
import { RecoveryPage } from "../modules/recovery/recovery-page";
import { useCustomerSession } from "../shared/auth/customer-session";

function CustomerProtectedRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated, loading } = useCustomerSession();

  if (loading) {
    return (
      <main className="front-shell">
        <div className="state-box">Loading your customer session...</div>
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
      <Route path="/" element={<ProductsListPage />} />
      <Route path="/products/:slug" element={<ProductPage />} />
      <Route path="/recover/:recoveryToken" element={<RecoveryPage />} />
      <Route path="/account/login" element={<CustomerAccountLoginPage />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
