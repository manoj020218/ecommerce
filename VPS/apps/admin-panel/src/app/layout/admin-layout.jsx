import { useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ADMIN_NAV_ITEMS } from "../constants/navigation";
import { adminLogout } from "../../modules/auth/auth.api";
import { useAuthSession } from "../../modules/auth/use-auth-session";
import { hasPermission } from "../../shared/utils/permissions";
import { useInstallPrompt } from "../../shared/hooks/use-install-prompt";

function titleFromPath(pathname) {
  if (pathname.startsWith("/dashboard"))       return "Dashboard";
  if (pathname.startsWith("/walk-in-orders"))  return "Walk-in Orders";
  if (pathname.startsWith("/orders"))          return "Orders";
  if (pathname.startsWith("/abandoned-carts")) return "Abandoned Carts";
  if (pathname.startsWith("/website-leads"))   return "Website Buyer Leads";
  if (pathname.startsWith("/categories"))      return "Categories";
  if (pathname.startsWith("/products"))        return "Products";
  if (pathname.startsWith("/reviews"))         return "Reviews & Ratings";
  if (pathname.startsWith("/partners"))        return "Partner Feeds";
  if (pathname.startsWith("/content-assistant")) return "Content Assistant";
  if (pathname.startsWith("/inventory"))       return "Inventory";
  if (pathname.startsWith("/hsn-tax"))         return "HSN / Tax Master";
  if (pathname.startsWith("/search"))          return "Search";
  if (pathname.startsWith("/customers"))       return "Customers";
  if (pathname.startsWith("/discounts"))       return "Discounts & Coupons";
  if (pathname.startsWith("/invoices"))        return "Invoices";
  if (pathname.startsWith("/tally-export"))    return "Tally Export";
  if (pathname.startsWith("/shipping"))        return "Shipping";
  if (pathname.startsWith("/reports"))         return "Reports";
  if (pathname.startsWith("/marketing"))       return "Marketing";
  if (pathname.startsWith("/notifications"))   return "Notifications";
  if (pathname.startsWith("/google-merchant")) return "Google Merchant";
  if (pathname.startsWith("/facebook-feed"))   return "Facebook Feed";
  if (pathname.startsWith("/blogs"))           return "Blogs / Knowledge Base";
  if (pathname.startsWith("/staff"))           return "Staff";
  if (pathname.startsWith("/audit-logs"))      return "Audit Logs";
  if (pathname.startsWith("/permission-groups"))return "Permission Groups";
  if (pathname.startsWith("/settings"))        return "Settings";
  if (pathname.startsWith("/payment-gateways"))return "Payment Gateways";
  if (pathname.startsWith("/integrations"))    return "Third Party Integrations";
  if (pathname.startsWith("/setup-wizard"))    return "Setup Wizard";
  if (pathname.startsWith("/seo"))             return "SEO";
  return "Catalogue Overview";
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, clearSession } = useAuthSession();
  const { canInstall, promptInstall } = useInstallPrompt();

  const visibleGroups = useMemo(() => {
    return ADMIN_NAV_ITEMS.map((group) => ({
      ...group,
      items: group.items
        .filter((item) => hasPermission(session, item.permission))
        .map((item) => ({
          ...item,
          children: (item.children || []).filter((c) => hasPermission(session, c.permission))
        }))
    })).filter((group) => group.items.length > 0);
  }, [session]);

  // Mobile nav shows all items (parents + children) flattened
  const mobileItems = useMemo(() => {
    return visibleGroups.flatMap((group) =>
      group.items.flatMap((item) => [item, ...(item.children || [])])
    );
  }, [visibleGroups]);

  const adminName  = session?.admin?.name  || "Admin User";
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
            <p>Admin Workspace</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleGroups.map((group) => (
            <section key={group.group}>
              {group.groupPath && hasPermission(session, group.groupPermission) ? (
                <NavLink
                  to={group.groupPath}
                  className={({ isActive }) =>
                    `sidebar-group sidebar-group-link${isActive ? " active" : ""}`
                  }
                >
                  {group.group}
                </NavLink>
              ) : (
                <p className="sidebar-group">{group.group}</p>
              )}
              {group.items.map((item) => (
                <div key={item.key}>
                  {item.external ? (
                    <a
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sidebar-link"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <NavLink
                      to={item.path}
                      end={!(item.children?.length > 0)}
                      className={({ isActive }) =>
                        `sidebar-link${isActive ? " active" : ""}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  )}
                  {item.children?.map((child) => (
                    <NavLink
                      key={child.key}
                      to={child.path}
                      className={({ isActive }) =>
                        `sidebar-sublink${isActive ? " active" : ""}`
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
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
            <p>Admin workspace — Jenix India</p>
          </div>
          <div className="topbar-user">
            {canInstall && (
              <button type="button" className="btn btn-secondary btn-small" onClick={promptInstall}>
                Install App
              </button>
            )}
            <span>{session?.admin?.role || "staff"}</span>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav">
        {mobileItems.map((item) =>
          item.external ? (
            <a
              key={item.key}
              href={item.path}
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-link"
            >
              {item.label}
            </a>
          ) : (
            <NavLink
              key={item.key}
              to={item.path}
              className={({ isActive }) => `mobile-link${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          )
        )}
      </nav>
    </div>
  );
}
