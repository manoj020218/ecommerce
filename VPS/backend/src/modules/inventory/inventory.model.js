const INVENTORY_MOVEMENT_TYPES = Object.freeze({
  MANUAL_ADJUSTMENT: "manual_adjustment"
});

function sanitizeInventoryMovement(movement) {
  return { ...movement };
}

module.exports = { INVENTORY_MOVEMENT_TYPES, sanitizeInventoryMovement };
