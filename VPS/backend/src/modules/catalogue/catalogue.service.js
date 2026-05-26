const { HttpError } = require("../../common/http-error");
const { readCatalogStore } = require("../../database/catalog-store");
const { buildCatalogueSummary } = require("./catalogue.model");

async function getCatalogueSummary() {
  const store = await readCatalogStore();
  return buildCatalogueSummary(store);
}

async function exportProducts(filters) {
  const store = await readCatalogStore();
  let rows = [...store.products];

  if (!filters.includeInactive) {
    rows = rows.filter((product) => product.isActive);
  }

  return {
    exportedAt: new Date().toISOString(),
    count: rows.length,
    products: rows
  };
}

async function importProductsPlaceholder() {
  throw new HttpError(
    501,
    "Catalogue import workflow is TODO. Phase 4 migration/import module will implement this."
  );
}

module.exports = { getCatalogueSummary, exportProducts, importProductsPlaceholder };
