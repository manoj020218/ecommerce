import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime, formatNumber } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { fetchCategories } from "../categories/categories.api";
import { fetchProducts, updateProduct } from "../products/products.api";
import { useAuthSession } from "../auth/use-auth-session";
import {
  adjustInventory,
  fetchInventoryByProduct,
  fetchInventoryMovements,
  fetchLowStockAlerts,
  updateInventoryPolicy
} from "./inventory.api";

function categoryNameById(categoryMap, categoryId) {
  if (!categoryId) {
    return "Uncategorized";
  }
  return categoryMap.get(categoryId)?.name || "Unknown";
}

function computeInventoryStats(rows) {
  const totals = {
    totalSkus: rows.length,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0
  };

  rows.forEach((row) => {
    if (row.stockStatus === "in_stock") {
      totals.inStock += 1;
    } else if (row.stockStatus === "low_stock") {
      totals.lowStock += 1;
    } else if (row.stockStatus === "out_of_stock") {
      totals.outOfStock += 1;
    }
  });

  return totals;
}

export function InventoryPage() {
  const { session } = useAuthSession();
  const canAdjust = hasPermission(session, "inventory.adjust");
  const canEditProduct = hasPermission(session, "products.edit");
  const canEditPolicy = hasPermission(session, "inventory.edit_policy");
  const canViewMovements = hasPermission(session, "inventory.view_movements");
  const canViewLowStock = hasPermission(session, "inventory.view_low_stock");
  const canQuickUpdate = canAdjust || canEditProduct;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    categoryId: "",
    includeInactive: false
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [quickUpdateModalOpen, setQuickUpdateModalOpen] = useState(false);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    deltaQty: 0,
    reason: "",
    note: ""
  });
  const [policyForm, setPolicyForm] = useState({
    allowBackorder: false,
    maxOrderQty: 1000,
    lowStockThreshold: 0,
    stockStatus: "in_stock"
  });
  const [quickUpdateForm, setQuickUpdateForm] = useState({
    salePrice: 0,
    stockQty: 0,
    reason: "Quick inventory update",
    note: ""
  });
  const [saving, setSaving] = useState(false);

  const categoryMap = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  const stats = useMemo(() => computeInventoryStats(rows), [rows]);

  const loadAll = async (nextFilters = filters) => {
    setLoading(true);
    setError("");

    try {
      const [productData, categoryData, lowStockData, movementData] = await Promise.all([
        fetchProducts(nextFilters),
        fetchCategories({ includeInactive: false, q: "" }),
        canViewLowStock ? fetchLowStockAlerts(20) : Promise.resolve([]),
        canViewMovements ? fetchInventoryMovements({ limit: 50 }) : Promise.resolve([])
      ]);

      setRows(Array.isArray(productData) ? productData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setLowStockAlerts(Array.isArray(lowStockData) ? lowStockData : []);
      setMovements(Array.isArray(movementData) ? movementData : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load inventory data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const onFilterSubmit = async (event) => {
    event.preventDefault();
    await loadAll(filters);
  };

  const onOpenAdjust = async (row) => {
    try {
      const inventory = await fetchInventoryByProduct(row.id);
      setSelectedProduct({ ...row, inventory });
      setAdjustForm({
        deltaQty: 0,
        reason: "",
        note: ""
      });
      setAdjustModalOpen(true);
    } catch (apiError) {
      setError(apiError.message || "Failed to open inventory adjustment.");
    }
  };

  const onOpenPolicy = async (row) => {
    try {
      const inventory = await fetchInventoryByProduct(row.id);
      setSelectedProduct({ ...row, inventory });
      setPolicyForm({
        allowBackorder: Boolean(inventory.allowBackorder),
        maxOrderQty: Number(inventory.maxOrderQty || 1000),
        lowStockThreshold: Number(inventory.lowStockThreshold || 0),
        stockStatus: inventory.stockStatus || "in_stock"
      });
      setPolicyModalOpen(true);
    } catch (apiError) {
      setError(apiError.message || "Failed to load policy.");
    }
  };

  const onOpenQuickUpdate = async (row) => {
    try {
      const inventory = await fetchInventoryByProduct(row.id);
      setSelectedProduct({ ...row, inventory });
      setQuickUpdateForm({
        salePrice: Number(row.salePrice ?? row.basePrice ?? 0),
        stockQty: Number(inventory.stockQty ?? row.stockQty ?? 0),
        reason: "Quick inventory update",
        note: ""
      });
      setQuickUpdateModalOpen(true);
    } catch (apiError) {
      setError(apiError.message || "Failed to open quick update.");
    }
  };

  const onSubmitAdjust = async (event) => {
    event.preventDefault();
    if (!selectedProduct) {
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");

    try {
      await adjustInventory(selectedProduct.id, {
        deltaQty: Number(adjustForm.deltaQty || 0),
        reason: adjustForm.reason,
        note: adjustForm.note
      });
      setAdjustModalOpen(false);
      setNotice(`Inventory adjusted for ${selectedProduct.title}.`);
      await loadAll(filters);
    } catch (apiError) {
      setError(apiError.message || "Inventory adjustment failed.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmitPolicy = async (event) => {
    event.preventDefault();
    if (!selectedProduct) {
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");

    try {
      await updateInventoryPolicy(selectedProduct.id, {
        allowBackorder: Boolean(policyForm.allowBackorder),
        maxOrderQty: Number(policyForm.maxOrderQty || 1),
        lowStockThreshold: Number(policyForm.lowStockThreshold || 0),
        stockStatus: policyForm.stockStatus
      });
      setPolicyModalOpen(false);
      setNotice(`Inventory policy updated for ${selectedProduct.title}.`);
      await loadAll(filters);
    } catch (apiError) {
      setError(apiError.message || "Inventory policy update failed.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmitQuickUpdate = async (event) => {
    event.preventDefault();
    if (!selectedProduct) {
      return;
    }

    setSaving(true);
    setNotice("");
    setError("");

    try {
      const nextSalePrice = Number(quickUpdateForm.salePrice);
      const nextStockQty = Number(quickUpdateForm.stockQty);
      const currentSalePrice = Number(selectedProduct.salePrice ?? 0);
      const currentStockQty = Number(
        selectedProduct.inventory?.stockQty ?? selectedProduct.stockQty ?? 0
      );
      const basePrice = Number(selectedProduct.basePrice ?? 0);

      if (canEditProduct) {
        if (Number.isNaN(nextSalePrice) || nextSalePrice < 0) {
          throw new Error("Sale price must be a valid non-negative number.");
        }
        if (nextSalePrice > basePrice) {
          throw new Error("Sale price cannot be greater than base price.");
        }
      }

      if (canAdjust) {
        if (!Number.isInteger(nextStockQty) || nextStockQty < 0) {
          throw new Error("Stock quantity must be a non-negative whole number.");
        }
      }

      const salePriceChanged = canEditProduct && nextSalePrice !== currentSalePrice;
      const stockDelta = canAdjust ? nextStockQty - currentStockQty : 0;
      const stockChanged = canAdjust && stockDelta !== 0;

      if (!salePriceChanged && !stockChanged) {
        setNotice("No changes found to update.");
        setQuickUpdateModalOpen(false);
        return;
      }

      if (salePriceChanged) {
        await updateProduct(selectedProduct.id, { salePrice: nextSalePrice });
      }

      if (stockChanged) {
        const reason = quickUpdateForm.reason.trim();
        if (reason.length < 2) {
          throw new Error("Reason is required for stock update.");
        }

        await adjustInventory(selectedProduct.id, {
          deltaQty: stockDelta,
          reason,
          note: quickUpdateForm.note
        });
      }

      setQuickUpdateModalOpen(false);
      setNotice(`Quick update applied for ${selectedProduct.title}.`);
      await loadAll(filters);
    } catch (apiError) {
      setError(apiError.message || "Quick update failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading inventory..." />;
  }

  if (error && rows.length === 0) {
    return <ErrorBlock message={error} onRetry={() => loadAll(filters)} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Inventory"
        description="Track stock, low-stock alerts, movements, and inventory policies."
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Total SKUs</p>
          <h3>{formatNumber(stats.totalSkus)}</h3>
          <span>Active product records</span>
        </article>
        <article className="summary-card">
          <p>In Stock</p>
          <h3>{formatNumber(stats.inStock)}</h3>
          <span>Healthy inventory status</span>
        </article>
        <article className="summary-card">
          <p>Low Stock</p>
          <h3>{formatNumber(stats.lowStock)}</h3>
          <span>Below threshold alerts</span>
        </article>
        <article className="summary-card">
          <p>Out of Stock</p>
          <h3>{formatNumber(stats.outOfStock)}</h3>
          <span>Require restock action</span>
        </article>
      </div>

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search"
          placeholder="Search by title, SKU, model, or keywords"
          value={filters.q}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              q: event.target.value
            }))
          }
        />
        <select
          value={filters.categoryId}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              categoryId: event.target.value
            }))
          }
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
      </form>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {canViewLowStock && lowStockAlerts.length > 0 ? (
        <section className="alert-panel">
          <h4>Low Stock Alerts</h4>
          <div className="alert-chips">
            {lowStockAlerts.slice(0, 8).map((item) => (
              <span key={item.id} className="alert-chip">
                {item.sku} | Available {item.availableQty}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Sale Price</th>
              <th>Stock</th>
              <th>Reserved</th>
              <th>Available</th>
              <th>Threshold</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                </td>
                <td>{row.sku}</td>
                <td>{categoryNameById(categoryMap, row.categoryId)}</td>
                <td>{formatNumber(row.salePrice)}</td>
                <td>{formatNumber(row.stockQty)}</td>
                <td>{formatNumber(row.reservedQty)}</td>
                <td>{formatNumber(row.availableQty)}</td>
                <td>{formatNumber(row.lowStockThreshold)}</td>
                <td>
                  <StatusBadge value={row.stockStatus} />
                </td>
                <td className="row-actions">
                  {canQuickUpdate ? (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => onOpenQuickUpdate(row)}
                    >
                      Quick Update
                    </button>
                  ) : null}
                  {canAdjust ? (
                    <button type="button" className="btn-link" onClick={() => onOpenAdjust(row)}>
                      Adjust
                    </button>
                  ) : null}
                  {canEditPolicy ? (
                    <button type="button" className="btn-link" onClick={() => onOpenPolicy(row)}>
                      Policy
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {rows.map((row) => (
          <article key={row.id} className="card">
            <div className="card-head">
              <h4>{row.title}</h4>
              <StatusBadge value={row.stockStatus} />
            </div>
            <p className="muted">{row.sku}</p>
            <p className="muted">{categoryNameById(categoryMap, row.categoryId)}</p>
            <p className="muted">Sale Price: {formatNumber(row.salePrice)}</p>
            <p>
              Stock {row.stockQty} | Reserved {row.reservedQty} | Available {row.availableQty}
            </p>
            <p className="muted">Threshold: {row.lowStockThreshold}</p>
            <div className="card-actions">
              {canQuickUpdate ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onOpenQuickUpdate(row)}
                >
                  Quick Update
                </button>
              ) : null}
              {canAdjust ? (
                <button type="button" className="btn btn-secondary" onClick={() => onOpenAdjust(row)}>
                  Adjust
                </button>
              ) : null}
              {canEditPolicy ? (
                <button type="button" className="btn btn-secondary" onClick={() => onOpenPolicy(row)}>
                  Policy
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {canViewMovements && movements.length > 0 ? (
        <section className="table-wrap">
          <h4 className="sub-title">Recent Inventory Movements</h4>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>SKU</th>
                <th>Delta</th>
                <th>Previous</th>
                <th>Next</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.slice(0, 12).map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.createdAt)}</td>
                  <td>{movement.productSku}</td>
                  <td>{movement.deltaQty}</td>
                  <td>{movement.previousStockQty}</td>
                  <td>{movement.nextStockQty}</td>
                  <td>{movement.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <Modal
        title={`Adjust Inventory${selectedProduct ? ` - ${selectedProduct.sku}` : ""}`}
        open={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
      >
        <form className="form-grid" onSubmit={onSubmitAdjust}>
          <label className="field">
            <span>Delta Qty *</span>
            <input
              type="number"
              name="deltaQty"
              min="-1000000"
              max="1000000"
              value={adjustForm.deltaQty}
              onChange={(event) =>
                setAdjustForm((current) => ({
                  ...current,
                  deltaQty: event.target.value
                }))
              }
              required
            />
          </label>

          <label className="field">
            <span>Reason *</span>
            <input
              name="reason"
              value={adjustForm.reason}
              onChange={(event) =>
                setAdjustForm((current) => ({
                  ...current,
                  reason: event.target.value
                }))
              }
              required
            />
          </label>

          <label className="field field-full">
            <span>Note</span>
            <textarea
              rows="3"
              value={adjustForm.note}
              onChange={(event) =>
                setAdjustForm((current) => ({
                  ...current,
                  note: event.target.value
                }))
              }
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAdjustModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Quick Update${selectedProduct ? ` - ${selectedProduct.sku}` : ""}`}
        open={quickUpdateModalOpen}
        onClose={() => setQuickUpdateModalOpen(false)}
      >
        <form className="form-grid" onSubmit={onSubmitQuickUpdate}>
          <label className="field">
            <span>Sale Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={quickUpdateForm.salePrice}
              onChange={(event) =>
                setQuickUpdateForm((current) => ({
                  ...current,
                  salePrice: event.target.value
                }))
              }
              disabled={!canEditProduct}
            />
          </label>

          <label className="field">
            <span>Stock Qty</span>
            <input
              type="number"
              min="0"
              step="1"
              value={quickUpdateForm.stockQty}
              onChange={(event) =>
                setQuickUpdateForm((current) => ({
                  ...current,
                  stockQty: event.target.value
                }))
              }
              disabled={!canAdjust}
            />
          </label>

          {canAdjust ? (
            <label className="field">
              <span>Reason *</span>
              <input
                value={quickUpdateForm.reason}
                onChange={(event) =>
                  setQuickUpdateForm((current) => ({
                    ...current,
                    reason: event.target.value
                  }))
                }
                required
              />
            </label>
          ) : null}

          {canAdjust ? (
            <label className="field field-full">
              <span>Note</span>
              <textarea
                rows="3"
                value={quickUpdateForm.note}
                onChange={(event) =>
                  setQuickUpdateForm((current) => ({
                    ...current,
                    note: event.target.value
                  }))
                }
              />
            </label>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setQuickUpdateModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Update"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Inventory Policy${selectedProduct ? ` - ${selectedProduct.sku}` : ""}`}
        open={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
      >
        <form className="form-grid" onSubmit={onSubmitPolicy}>
          <label className="field">
            <span>Stock Status</span>
            <select
              value={policyForm.stockStatus}
              onChange={(event) =>
                setPolicyForm((current) => ({
                  ...current,
                  stockStatus: event.target.value
                }))
              }
            >
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="backorder">Backorder</option>
            </select>
          </label>

          <label className="field">
            <span>Max Order Qty</span>
            <input
              type="number"
              min="1"
              value={policyForm.maxOrderQty}
              onChange={(event) =>
                setPolicyForm((current) => ({
                  ...current,
                  maxOrderQty: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Low Stock Threshold</span>
            <input
              type="number"
              min="0"
              value={policyForm.lowStockThreshold}
              onChange={(event) =>
                setPolicyForm((current) => ({
                  ...current,
                  lowStockThreshold: event.target.value
                }))
              }
            />
          </label>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={policyForm.allowBackorder}
              onChange={(event) =>
                setPolicyForm((current) => ({
                  ...current,
                  allowBackorder: event.target.checked
                }))
              }
            />
            Allow Backorder
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPolicyModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Update Policy"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
