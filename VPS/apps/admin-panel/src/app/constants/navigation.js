export const ADMIN_NAV_ITEMS = [
  {
    group: "Overview",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        path: "/dashboard",
        permission: null
      }
    ]
  },
  {
    group: "Orders",
    items: [
      {
        key: "orders",
        label: "All Orders",
        path: "/orders",
        permission: "orders.view",
        children: [
          { key: "walk-in-orders",  label: "Walk-in Orders",   path: "/walk-in-orders",  permission: "orders.view" },
          { key: "abandoned-carts", label: "Abandoned Carts",  path: "/abandoned-carts", permission: "marketing.view" },
          { key: "website-leads",   label: "Website Leads",    path: "/website-leads",   permission: "website_leads.view" }
        ]
      }
    ]
  },
  {
    group: "Catalogue",
    items: [
      {
        key: "catalogue",
        label: "Products",
        path: "/catalogue",
        permission: "products.view",
        children: [
          { key: "categories", label: "Categories", path: "/categories", permission: "categories.view" },
          { key: "inventory",  label: "Inventory",  path: "/inventory",  permission: "inventory.view" },
          { key: "hsn-tax",    label: "HSN / Tax",  path: "/hsn-tax",    permission: "hsn_tax.view" },
          { key: "search",     label: "Search",     path: "/search",     permission: "search.view" }
        ]
      }
    ]
  },
  {
    group: "Customers",
    items: [
      {
        key: "customers",
        label: "Customers",
        path: "/customers",
        permission: "customers.view",
        children: [
          { key: "discounts", label: "Discounts & Coupons", path: "/discounts", permission: "payments.view" }
        ]
      }
    ]
  },
  {
    group: "Finance",
    items: [
      {
        key: "invoices",
        label: "Invoices",
        path: "/invoices",
        permission: "invoices.view",
        children: [
          { key: "tally-export", label: "Tally Export", path: "/tally-export", permission: "invoices.export_tally" }
        ]
      },
      { key: "shipping", label: "Shipping", path: "/shipping", permission: "shipping.view" },
      { key: "reports",  label: "Reports",  path: "/reports",  permission: "reports.view" }
    ]
  },
  {
    group: "Marketing",
    items: [
      {
        key: "marketing",
        label: "Marketing",
        path: "/marketing",
        permission: "marketing.view",
        children: [
          { key: "google-merchant", label: "Google Merchant", path: "/google-merchant", permission: "settings.view" },
          { key: "facebook-feed",   label: "Facebook Feed",   path: "/facebook-feed",   permission: "settings.view" }
        ]
      },
      {
        key: "notifications",
        label: "Notifications",
        path: "/notifications",
        permission: "marketing.view"
      }
    ]
  },
  {
    group: "Content",
    items: [
      { key: "blogs", label: "Blogs / Knowledge", path: "/blogs", permission: "blogs.view" },
      { key: "web-builder", label: "Web Builder", path: "/web-builder", permission: "settings.view" }
    ]
  },
  {
    group: "Admin",
    items: [
      {
        key: "staff",
        label: "Staff & Permissions",
        path: "/staff",
        permission: "staff.view",
        children: [
          { key: "audit-logs",        label: "Audit Logs",        path: "/audit-logs",        permission: "staff.view" },
          { key: "permission-groups", label: "Permission Groups", path: "/permission-groups", permission: "staff.view" }
        ]
      },
      {
        key: "settings",
        label: "Settings",
        path: "/settings",
        permission: "settings.view",
        children: [
          { key: "payment-gateways", label: "Payment Gateways",       path: "/payment-gateways", permission: "payments.view" },
          { key: "integrations",     label: "Third Party Integrations",path: "/integrations",     permission: "settings.view" },
          { key: "setup-wizard",     label: "Setup Wizard",           path: "/setup-wizard",     permission: "settings.view" },
          { key: "seo",              label: "SEO",                    path: "/seo",              permission: "settings.view" }
        ]
      }
    ]
  }
];
