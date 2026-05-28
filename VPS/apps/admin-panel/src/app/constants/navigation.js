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
        key: "reports",
        label: "Reports",
        path: "/reports",
        permission: "reports.view"
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
      }
    ]
  },
  {
    group: "Setup",
    items: [
      {
        key: "settings",
        label: "Settings",
        path: "/settings",
        permission: "settings.view"
      }
    ]
  }
];
