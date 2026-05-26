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
  }
];
