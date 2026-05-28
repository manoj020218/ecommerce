import { useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ADMIN_NAV_ITEMS } from "../constants/navigation";
import { adminLogout } from "../../modules/auth/auth.api";
import { useAuthSession } from "../../modules/auth/use-auth-session";
import { hasPermission } from "../../shared/utils/permissions";

function titleFromPath(pathname) {
  if (pathname.startsWith("/categories")) {
    return "Categories";
  }
  if (pathname.startsWith("/products")) {
    return "Products";
  }
  if (pathname.startsWith("/hsn-tax")) {
    return "HSN / Tax Master";
  }
  if (pathname.startsWith("/inventory")) {
    return "Inventory";
  }
  if (pathname.startsWith("/reports")) {
    return "Reports";
  }
  if (pathname.startsWith("/blogs")) {
    return "Blogs / Knowledge Base";
  }
  if (pathname.startsWith("/marketing")) {
    return "Marketing";
  }
  if (pathname.startsWith("/website-leads")) {
    return "Website Buyer Leads";
  }
  return "Catalogue Overview";
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, clearSession } = useAuthSession();

  const visibleGroups = useMemo(() => {
    return ADMIN_NAV_ITEMS.map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(session, item.permission))
    })).filter((group) => group.items.length > 0);
  }, [session]);

  const mobileItems = useMemo(() => {
    return visibleGroups.flatMap((group) => group.items);
  }, [visibleGroups]);

  const adminName = session?.admin?.name || "Admin User";
  const adminEmail = session?.admin?.email || "admin@jenixindia.com";

  const onLogout = async () => {
    try {
      if (session?.refreshToken) {
        await adminLogout(session.refreshToken);
      }
    } catch (_error) {
      // best-effort logout
    } finally {
      clearSession();
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-dot small">J</span>
          <div>
            <strong>Jenix Admin</strong>
            <p>Catalogue Workspace</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleGroups.map((group) => (
            <section key={group.group}>
              <p className="sidebar-group">{group.group}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? " active" : ""}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>
            <strong>{adminName}</strong>
            <p>{adminEmail}</p>
          </div>
          <button type="button" className="btn btn-secondary btn-small" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <h1>{titleFromPath(location.pathname)}</h1>
            <p>Admin workspace aligned to PROJECT.md phases</p>
          </div>
          <div className="topbar-user">
            <span>{session?.admin?.role || "staff"}</span>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav">
        {mobileItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            className={({ isActive }) => `mobile-link${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
