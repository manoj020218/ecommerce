export const ADMIN_NAV_ITEMS = [
  {
    group: "Catalogue",
    items: [
      {
        key: "catalogue",
        label: "Catalogue",
        path: "/catalogue",
        permission: "products.view"
      },
      {
        key: "categories",
        label: "Categories",
        path: "/categories",
        permission: "categories.view"
      },
      {
        key: "products",
        label: "Products",
        path: "/products",
        permission: "products.view"
      },
      {
        key: "hsn-tax",
        label: "HSN / Tax",
        path: "/hsn-tax",
        permission: "hsn_tax.view"
      },
      {
        key: "inventory",
        label: "Inventory",
        path: "/inventory",
        permission: "inventory.view"
      },
      {
        key: "search",
        label: "Search",
        path: "/search",
        permission: "search.view"
      }
    ]
  },
  {
    group: "Content",
    items: [
      {
        key: "blogs",
        label: "Blogs",
        path: "/blogs",
        permission: "blogs.view"
      }
    ]
  },
  {
    group: "Operations",
    items: [
      {
        key: "orders",
        label: "Orders",
        path: "/orders",
        permission: "orders.view"
      },
      {
        key: "customers",
        label: "Customers",
        path: "/customers",
        permission: "customers.view"
      },
      {
        key: "walk-in-orders",
        label: "Walk-in Orders",
        path: "/walk-in-orders",
        permission: "orders.view"
      },
      {
        key: "shipping",
        label: "Shipping",
        path: "/shipping",
        permission: "shipping.view"
      },
      {
        key: "invoices",
        label: "Invoices",
        path: "/invoices",
        permission: "invoices.view"
      },
      {
        key: "tally-export",
        label: "Tally Export",
        path: "/tally-export",
        permission: "invoices.export_tally"
      },
      {
        key: "reports",
        label: "Reports",
        path: "/reports",
        permission: "reports.view"
      },
      {
        key: "audit-logs",
        label: "Audit Logs",
        path: "/audit-logs",
        permission: "staff.view"
      },
      {
        key: "staff",
        label: "Staff",
        path: "/staff",
        permission: "staff.view"
      },
      {
        key: "permission-groups",
        label: "Permission Groups",
        path: "/permission-groups",
        permission: "staff.view"
      }
    ]
  },
  {
    group: "Marketing",
    items: [
      {
        key: "marketing",
        label: "Marketing",
        path: "/marketing",
        permission: "marketing.view"
      },
      {
        key: "website-leads",
        label: "Website Leads",
        path: "/website-leads",
        permission: "website_leads.view"
      },
      {
        key: "abandoned-carts",
        label: "Abandoned Carts",
        path: "/abandoned-carts",
        permission: "marketing.view"
      },
      {
        key: "google-merchant",
        label: "Google Merchant",
        path: "/google-merchant",
        permission: "settings.view"
      },
      {
        key: "facebook-feed",
        label: "Facebook Feed",
        path: "/facebook-feed",
        permission: "settings.view"
      }
    ]
  },
  {
    group: "Setup",
    items: [
      {
        key: "setup-wizard",
        label: "Setup Wizard",
        path: "/setup-wizard",
        permission: "settings.view"
      },
      {
        key: "settings",
        label: "Settings",
        path: "/settings",
        permission: "settings.view"
      },
      {
        key: "payment-gateways",
        label: "Payment Gateways",
        path: "/payment-gateways",
        permission: "payments.view"
      },
      {
        key: "integrations",
        label: "Third Party Integrations",
        path: "/integrations",
        permission: "settings.view"
      },
      {
        key: "seo",
        label: "SEO",
        path: "/seo",
        permission: "settings.view"
      }
    ]
  }
];
