function buildCatalogueSummary(store) {
  const totalProducts = store.products.length;
  const activeProducts = store.products.filter((product) => product.isActive).length;
  const inactiveProducts = totalProducts - activeProducts;
  const totalCategories = store.categories.length;
  const activeCategories = store.categories.filter(
    (category) => category.isActive
  ).length;

  return {
    products: {
      total: totalProducts,
      active: activeProducts,
      inactive: inactiveProducts
    },
    categories: {
      total: totalCategories,
      active: activeCategories,
      inactive: totalCategories - activeCategories
    },
    hsnTax: {
      total: store.hsnTaxMaster.length,
      active: store.hsnTaxMaster.filter((row) => row.isActive).length
    }
  };
}

module.exports = { buildCatalogueSummary };
