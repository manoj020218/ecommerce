const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { calculateAvailableQty } = require("../products/products.model");
const {
  INVENTORY_MOVEMENT_TYPES,
  sanitizeInventoryMovement
} = require("./inventory.model");

function resolveStockStatus(product) {
  const availableQty = calculateAvailableQty(product);
  const lowStockThreshold = Number(product.lowStockThreshold || 0);

  if (availableQty <= 0) {
    return product.allowBackorder ? "backorder" : "out_of_stock";
  }

  if (availableQty <= lowStockThreshold) {
    return "low_stock";
  }

  return "in_stock";
}

function getProductByIdOrThrow(store, productId) {
  const index = store.products.findIndex((product) => product.id === productId);
  if (index < 0) {
    throw new HttpError(404, "Product not found.");
  }
  return { index, product: store.products[index] };
}

function inventoryViewFromProduct(product) {
  return {
    id: product.id,
    title: product.title,
    sku: product.sku,
    stockQty: Number(product.stockQty || 0),
    reservedQty: Number(product.reservedQty || 0),
    availableQty: calculateAvailableQty(product),
    stockStatus: product.stockStatus,
    stockVisibility: "hide_quantity",
    allowBackorder: Boolean(product.allowBackorder),
    maxOrderQty: Number(product.maxOrderQty || 1000),
    lowStockThreshold: Number(product.lowStockThreshold || 0),
    updatedAt: product.updatedAt
  };
}

async function getInventoryByProductId(productId) {
  const store = await readCatalogStore();
  const { product } = getProductByIdOrThrow(store, productId);
  return inventoryViewFromProduct(product);
}

async function adjustInventory(productId, payload, actor) {
  const store = await readCatalogStore();
  const { index, product } = getProductByIdOrThrow(store, productId);

  const previousStockQty = Number(product.stockQty || 0);
  const nextStockQty = previousStockQty + Number(payload.deltaQty);

  if (nextStockQty < 0) {
    throw new HttpError(400, "Stock cannot become negative.");
  }

  const next = {
    ...product,
    stockQty: nextStockQty,
    stockStatus: resolveStockStatus({
      ...product,
      stockQty: nextStockQty
    }),
    updatedAt: new Date().toISOString()
  };

  store.products[index] = next;

  const movement = {
    id: generateId("inv_move"),
    productId,
    productSku: product.sku,
    movementType: INVENTORY_MOVEMENT_TYPES.MANUAL_ADJUSTMENT,
    deltaQty: Number(payload.deltaQty),
    previousStockQty,
    nextStockQty,
    reservedQty: Number(product.reservedQty || 0),
    availableQtyAfter: calculateAvailableQty(next),
    reason: payload.reason,
    note: payload.note || "",
    actorId: actor.id,
    actorRole: actor.role,
    createdAt: new Date().toISOString()
  };

  store.inventoryMovements.push(movement);
  await writeCatalogStore(store);

  await addActivityLog({
    action: "inventory.adjusted",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "inventory",
    resourceId: productId,
    metadata: {
      deltaQty: movement.deltaQty,
      reason: movement.reason
    }
  });

  return {
    inventory: inventoryViewFromProduct(next),
    movement: sanitizeInventoryMovement(movement)
  };
}

async function updateInventoryPolicy(productId, patch, actor) {
  const store = await readCatalogStore();
  const { index, product } = getProductByIdOrThrow(store, productId);

  const next = {
    ...product,
    ...patch,
    stockStatus:
      patch.stockStatus === undefined
        ? resolveStockStatus({
            ...product,
            ...patch
          })
        : patch.stockStatus,
    updatedAt: new Date().toISOString()
  };

  store.products[index] = next;
  await writeCatalogStore(store);

  await addActivityLog({
    action: "inventory.policy.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "inventory",
    resourceId: productId,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return inventoryViewFromProduct(next);
}

async function listInventoryMovements(filters) {
  const store = await readCatalogStore();
  let rows = [...store.inventoryMovements];

  if (filters.productId) {
    rows = rows.filter((row) => row.productId === filters.productId);
  }

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows.slice(0, filters.limit).map(sanitizeInventoryMovement);
}

async function listLowStockAlerts(filters) {
  const store = await readCatalogStore();
  const alerts = store.products
    .filter((product) => product.isActive)
    .map((product) => ({
      ...product,
      availableQty: calculateAvailableQty(product)
    }))
    .filter((product) => product.availableQty <= Number(product.lowStockThreshold || 0))
    .sort((a, b) => a.availableQty - b.availableQty)
    .slice(0, filters.limit)
    .map((product) => ({
      id: product.id,
      title: product.title,
      sku: product.sku,
      stockQty: Number(product.stockQty || 0),
      reservedQty: Number(product.reservedQty || 0),
      availableQty: Number(product.availableQty || 0),
      lowStockThreshold: Number(product.lowStockThreshold || 0),
      stockStatus: product.stockStatus
    }));

  return alerts;
}

module.exports = {
  getInventoryByProductId,
  adjustInventory,
  updateInventoryPolicy,
  listInventoryMovements,
  listLowStockAlerts
};
