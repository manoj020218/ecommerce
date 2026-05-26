import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { adminLogin } from "./auth.api";
import { useAuthSession } from "./use-auth-session";

const DEFAULT_FORM = {
  email: "admin@jenixindia.com",
  password: "ChangeMe@123"
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuthSession();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const redirectTo = useMemo(
    () => location.state?.from?.pathname || "/catalogue",
    [location.state]
  );

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await adminLogin(form);
      setSession({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        admin: response.admin
      });
      navigate(redirectTo, { replace: true });
    } catch (apiError) {
      setError(apiError.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <span className="logo-dot">J</span>
          <div>
            <h1>Jenix Admin</h1>
            <p>Phase 3 Catalogue Operations</p>
          </div>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Signing in..." : "Sign in to Admin"}
          </button>
        </form>

        <p className="login-footnote">
          Default local credentials are prefilled from backend seed fallbacks.
        </p>
      </section>
    </main>
  );
}
