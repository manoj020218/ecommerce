import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import {
  formatCurrencyInr,
  splitCsvInput,
  toCsvInput
} from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { fetchCategories } from "../categories/categories.api";
import { fetchHsnTaxRecords } from "../hsn-tax/hsn-tax.api";
import { useAuthSession } from "../auth/use-auth-session";
import {
  archiveProduct,
  createProduct,
  fetchProducts,
  updateProduct,
  uploadProductImage
} from "./products.api";

const EMPTY_FORM = {
  title: "",
  slug: "",
  oldUrl: "",
  categoryId: "",
  subcategoryId: "",
  brand: "",
  modelNumber: "",
  mpn: "",
  gtin: "",
  hsnCode: "",
  basePrice: "",
  salePrice: "",
  shortDescription: "",
  fullDescription: "",
  specificationsText: "{}",
  technicalKeywordsText: "",
  customerKeywordsText: "",
  useCasesText: "",
  problemStatementsText: "",
  moq: 1,
  bulkPricingEnabled: false,
  bulkPriceSlabsText: "",
  priceGroupPricesText: "",
  customerSpecificPricesText: "",
  quoteRequiredAboveQty: "",
  deadWeightKg: 0,
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  shippingClass: "normal",
  googleShoppingTitle: "",
  googleShoppingDescription: "",
  googleProductCategory: "",
  productType: "",
  isActive: true,
  stockQty: 0,
  reservedQty: 0,
  stockStatus: "in_stock",
  allowBackorder: false,
  maxOrderQty: 1000,
  lowStockThreshold: 0
};

function categoryNameById(map, categoryId) {
  if (!categoryId) {
    return "Uncategorized";
  }
  return map.get(categoryId)?.name || "Unknown";
}

function parseBulkPriceSlabs(text) {
  if (!text || !text.trim()) {
    return [];
  }

  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [minQtyRaw, unitPriceRaw] = part.split(":").map((value) => value.trim());
      const minQty = Number(minQtyRaw);
      const unitPrice = Number(unitPriceRaw);
      if (!Number.isInteger(minQty) || minQty < 1 || Number.isNaN(unitPrice)) {
        throw new Error(
          "Invalid bulk slab format. Use minQty:unitPrice, e.g. 10:2450, 25:2300"
        );
      }
      return { minQty, unitPrice };
    });
}

function bulkPriceSlabsToText(slabs) {
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return "";
  }

  return slabs.map((slab) => `${slab.minQty}:${slab.unitPrice}`).join(", ");
}

function parseStructuredPrices(text, keyName) {
  if (!text || !text.trim()) {
    return [];
  }

  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [keyRaw, unitPriceRaw] = part.split(":").map((value) => value.trim());
      const unitPrice = Number(unitPriceRaw);
      if (!keyRaw || Number.isNaN(unitPrice) || unitPrice < 0) {
        throw new Error(
          `Invalid ${keyName} format. Use ${keyName}:price, e.g. dealer:4100`
        );
      }
      return {
        [keyName]: keyRaw,
        unitPrice
      };
    });
}

function structuredPricesToText(rows, keyName) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  return rows.map((row) => `${row[keyName]}:${row.unitPrice}`).join(", ");
}

function formFromProduct(product) {
  return {
    title: product.title || "",
    slug: product.slug || "",
    oldUrl: product.oldUrl || "",
    categoryId: product.categoryId || "",
    subcategoryId: product.subcategoryId || "",
    brand: product.brand || "",
    modelNumber: product.modelNumber || "",
    mpn: product.mpn || "",
    gtin: product.gtin || "",
    hsnCode: product.hsnCode || "",
    basePrice: product.basePrice ?? "",
    salePrice: product.salePrice ?? "",
    shortDescription: product.shortDescription || "",
    fullDescription: product.fullDescription || "",
    specificationsText: JSON.stringify(product.specifications || {}, null, 2),
    technicalKeywordsText: toCsvInput(product.technicalKeywords),
    customerKeywordsText: toCsvInput(product.customerKeywords),
    useCasesText: toCsvInput(product.useCases),
    problemStatementsText: toCsvInput(product.problemStatements),
    moq: Number(product.moq || 1),
    bulkPricingEnabled: Boolean(product.bulkPricingEnabled),
    bulkPriceSlabsText: bulkPriceSlabsToText(product.bulkPriceSlabs),
    priceGroupPricesText: structuredPricesToText(product.priceGroupPrices, "priceGroup"),
    customerSpecificPricesText: structuredPricesToText(
      product.customerSpecificPrices,
      "customerId"
    ),
    quoteRequiredAboveQty:
      product.quoteRequiredAboveQty === null || product.quoteRequiredAboveQty === undefined
        ? ""
        : Number(product.quoteRequiredAboveQty),
    deadWeightKg: Number(product.deadWeightKg || 0),
    lengthCm: product.lengthCm ?? "",
    widthCm: product.widthCm ?? "",
    heightCm: product.heightCm ?? "",
    shippingClass: product.shippingClass || "normal",
    googleShoppingTitle: product.googleShoppingTitle || "",
    googleShoppingDescription: product.googleShoppingDescription || "",
    googleProductCategory: product.googleProductCategory || "",
    productType: product.productType || "",
    isActive: Boolean(product.isActive),
    stockQty: Number(product.stockQty || 0),
    reservedQty: Number(product.reservedQty || 0),
    stockStatus: product.stockStatus || "in_stock",
    allowBackorder: Boolean(product.allowBackorder),
    maxOrderQty: Number(product.maxOrderQty || 1000),
    lowStockThreshold: Number(product.lowStockThreshold || 0)
  };
}

function buildPayload(form) {
  let specifications = {};
  if (form.specificationsText.trim()) {
    specifications = JSON.parse(form.specificationsText);
  }

  const payload = {
    title: form.title,
    slug: form.slug.trim() || undefined,
    oldUrl: form.oldUrl,
    categoryId: form.categoryId || null,
    subcategoryId: form.subcategoryId || null,
    brand: form.brand,
    modelNumber: form.modelNumber,
    mpn: form.mpn,
    gtin: form.gtin,
    hsnCode: form.hsnCode,
    basePrice: Number(form.basePrice),
    salePrice: form.salePrice === "" ? undefined : Number(form.salePrice),
    shortDescription: form.shortDescription,
    fullDescription: form.fullDescription,
    specifications,
    technicalKeywords: splitCsvInput(form.technicalKeywordsText),
    customerKeywords: splitCsvInput(form.customerKeywordsText),
    useCases: splitCsvInput(form.useCasesText),
    problemStatements: splitCsvInput(form.problemStatementsText),
    moq: Number(form.moq || 1),
    bulkPricingEnabled: Boolean(form.bulkPricingEnabled),
    bulkPriceSlabs: parseBulkPriceSlabs(form.bulkPriceSlabsText),
    priceGroupPrices: parseStructuredPrices(form.priceGroupPricesText, "priceGroup"),
    customerSpecificPrices: parseStructuredPrices(
      form.customerSpecificPricesText,
      "customerId"
    ),
    quoteRequiredAboveQty:
      form.quoteRequiredAboveQty === "" || form.quoteRequiredAboveQty === null
        ? null
        : Number(form.quoteRequiredAboveQty),
    deadWeightKg: Number(form.deadWeightKg || 0),
    lengthCm: form.lengthCm === "" ? null : Number(form.lengthCm),
    widthCm: form.widthCm === "" ? null : Number(form.widthCm),
    heightCm: form.heightCm === "" ? null : Number(form.heightCm),
    shippingClass: form.shippingClass,
    googleShoppingTitle: form.googleShoppingTitle,
    googleShoppingDescription: form.googleShoppingDescription,
    googleProductCategory: form.googleProductCategory,
    productType: form.productType,
    isActive: Boolean(form.isActive),
    stockQty: Number(form.stockQty || 0),
    reservedQty: Number(form.reservedQty || 0),
    stockStatus: form.stockStatus,
    allowBackorder: Boolean(form.allowBackorder),
    maxOrderQty: Number(form.maxOrderQty || 1000),
    lowStockThreshold: Number(form.lowStockThreshold || 0)
  };

  return payload;
}

function stockSummary(product) {
  const available = Number(product.availableQty || 0);
  const reserved = Number(product.reservedQty || 0);
  return `${available} available / ${reserved} reserved`;
}

export function ProductsPage() {
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "products.create");
  const canEdit = hasPermission(session, "products.edit");
  const canDelete = hasPermission(session, "products.delete");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hsnRecords, setHsnRecords] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    categoryId: "",
    includeInactive: true
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingProductId, setUploadingProductId] = useState("");

  const categoryMap = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  const subcategoryOptions = useMemo(() => {
    return categories.filter((item) => item.parentCategoryId === form.categoryId);
  }, [categories, form.categoryId]);

  const loadProducts = async (nextFilters = filters) => {
    try {
      const data = await fetchProducts(nextFilters);
      setRows(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load products.");
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [productData, categoryData, hsnData] = await Promise.all([
        fetchProducts(filters),
        fetchCategories({ includeInactive: true, q: "" }),
        fetchHsnTaxRecords({ includeInactive: false, q: "" })
      ]);
      setRows(Array.isArray(productData) ? productData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setHsnRecords(Array.isArray(hsnData) ? hsnData : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load product dependencies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const onFilterSubmit = async (event) => {
    event.preventDefault();
    await loadProducts(filters);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      hsnCode: hsnRecords[0]?.hsnCode || ""
    });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(formFromProduct(row));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
  };

  const onFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");

    try {
      const payload = buildPayload(form);
      if (editingId) {
        await updateProduct(editingId, payload);
        setNotice("Product updated.");
      } else {
        await createProduct(payload);
        setNotice("Product created.");
      }
      closeModal();
      await loadProducts(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (row) => {
    const confirmed = window.confirm(`Archive product "${row.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await archiveProduct(row.id);
      setNotice(`Product archived: ${row.title}`);
      await loadProducts(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to archive product.");
    }
  };

  const onUploadImage = async (productId, file) => {
    if (!file) {
      return;
    }
    setUploadingProductId(productId);
    setError("");
    setNotice("");

    try {
      const response = await uploadProductImage(productId, file);
      setNotice(`Image uploaded: ${response.imageUrl}`);
      await loadProducts(filters);
    } catch (apiError) {
      setError(apiError.message || "Image upload failed.");
    } finally {
      setUploadingProductId("");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading products..." />;
  }

  if (error && rows.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Products"
        description="Full Phase 3 product wiring with HSN, pricing, keywords, and inventory policy."
        actions={
          canCreate ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add Product
            </button>
          ) : null
        }
      />

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
        <label className="inline-check">
          <input
            type="checkbox"
            checked={filters.includeInactive}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                includeInactive: event.target.checked
              }))
            }
          />
          Include inactive
        </label>
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
      </form>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Images</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                  <p className="row-sub">
                    HSN {row.hsnCode} | GST {row.gstRate}% | MOQ {row.moq}
                  </p>
                </td>
                <td>{row.sku}</td>
                <td>{categoryNameById(categoryMap, row.categoryId)}</td>
                <td>
                  <strong>{formatCurrencyInr(row.salePrice)}</strong>
                  {Number(row.basePrice) !== Number(row.salePrice) ? (
                    <p className="row-sub line-through">{formatCurrencyInr(row.basePrice)}</p>
                  ) : null}
                </td>
                <td>{stockSummary(row)}</td>
                <td>
                  <StatusBadge value={row.stockStatus} />
                  <span className="spacer-inline" />
                  <StatusBadge value={row.isActive ? "active" : "inactive"} />
                </td>
                <td>{Array.isArray(row.images) ? row.images.length : 0}</td>
                <td className="row-actions">
                  {canEdit ? (
                    <button type="button" className="btn-link" onClick={() => openEdit(row)}>
                      Edit
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button type="button" className="btn-link danger" onClick={() => onArchive(row)}>
                      Archive
                    </button>
                  ) : null}
                  {canEdit ? (
                    <label className="btn-link">
                      {uploadingProductId === row.id ? "Uploading..." : "Upload Image"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden-input"
                        disabled={uploadingProductId.length > 0}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          onUploadImage(row.id, file);
                          event.target.value = "";
                        }}
                      />
                    </label>
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
            <p className="muted">
              {categoryNameById(categoryMap, row.categoryId)} | HSN {row.hsnCode}
            </p>
            <p>
              {formatCurrencyInr(row.salePrice)}{" "}
              {Number(row.basePrice) !== Number(row.salePrice) ? (
                <span className="muted line-through">{formatCurrencyInr(row.basePrice)}</span>
              ) : null}
            </p>
            <p className="muted">{stockSummary(row)}</p>
            <div className="card-actions">
              {canEdit ? (
                <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" className="btn btn-danger" onClick={() => onArchive(row)}>
                  Archive
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <Modal
        title={editingId ? "Edit Product" : "Add Product"}
        open={modalOpen}
        onClose={closeModal}
        width="980px"
      >
        <form className="form-grid wide" onSubmit={onSubmit}>
          <h4 className="form-section">Core</h4>
          <label className="field">
            <span>Title *</span>
            <input name="title" value={form.title} onChange={onFormChange} required />
          </label>
          <label className="field">
            <span>Slug</span>
            <input name="slug" value={form.slug} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Category</span>
            <select name="categoryId" value={form.categoryId} onChange={onFormChange}>
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Subcategory</span>
            <select name="subcategoryId" value={form.subcategoryId} onChange={onFormChange}>
              <option value="">None</option>
              {subcategoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Brand</span>
            <input name="brand" value={form.brand} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Model Number</span>
            <input name="modelNumber" value={form.modelNumber} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>MPN</span>
            <input name="mpn" value={form.mpn} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>GTIN</span>
            <input name="gtin" value={form.gtin} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>HSN Code *</span>
            <select name="hsnCode" value={form.hsnCode} onChange={onFormChange} required>
              <option value="">Select HSN</option>
              {hsnRecords.map((hsn) => (
                <option key={hsn.hsnCode} value={hsn.hsnCode}>
                  {hsn.hsnCode} - {hsn.gstRate}% GST
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Old URL</span>
            <input name="oldUrl" value={form.oldUrl} onChange={onFormChange} />
          </label>

          <h4 className="form-section">Pricing & Inventory</h4>
          <label className="field">
            <span>Base Price *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="basePrice"
              value={form.basePrice}
              onChange={onFormChange}
              required
            />
          </label>
          <label className="field">
            <span>Sale Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="salePrice"
              value={form.salePrice}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>MOQ</span>
            <input type="number" min="1" name="moq" value={form.moq} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Quote Required Above Qty</span>
            <input
              type="number"
              min="1"
              name="quoteRequiredAboveQty"
              value={form.quoteRequiredAboveQty}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Stock Qty</span>
            <input
              type="number"
              min="0"
              name="stockQty"
              value={form.stockQty}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Reserved Qty</span>
            <input
              type="number"
              min="0"
              name="reservedQty"
              value={form.reservedQty}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Stock Status</span>
            <select name="stockStatus" value={form.stockStatus} onChange={onFormChange}>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="backorder">Backorder</option>
            </select>
          </label>
          <label className="field">
            <span>Low Stock Threshold</span>
            <input
              type="number"
              min="0"
              name="lowStockThreshold"
              value={form.lowStockThreshold}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Max Order Qty</span>
            <input
              type="number"
              min="1"
              name="maxOrderQty"
              value={form.maxOrderQty}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Dead Weight (kg)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="deadWeightKg"
              value={form.deadWeightKg}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Length (cm)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="lengthCm"
              value={form.lengthCm}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Width (cm)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="widthCm"
              value={form.widthCm}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Height (cm)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="heightCm"
              value={form.heightCm}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Shipping Class</span>
            <input name="shippingClass" value={form.shippingClass} onChange={onFormChange} />
          </label>

          <label className="inline-check">
            <input
              type="checkbox"
              name="bulkPricingEnabled"
              checked={form.bulkPricingEnabled}
              onChange={onFormChange}
            />
            Bulk pricing enabled
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              name="allowBackorder"
              checked={form.allowBackorder}
              onChange={onFormChange}
            />
            Allow backorder
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              name="isActive"
              checked={form.isActive}
              onChange={onFormChange}
            />
            Active
          </label>

          <label className="field field-full">
            <span>Bulk Price Slabs</span>
            <input
              name="bulkPriceSlabsText"
              value={form.bulkPriceSlabsText}
              onChange={onFormChange}
              placeholder="Format: 10:2450, 25:2300"
            />
          </label>
          <label className="field field-full">
            <span>Price Group Prices</span>
            <input
              name="priceGroupPricesText"
              value={form.priceGroupPricesText}
              onChange={onFormChange}
              placeholder="Format: dealer:4100, stockist:3950"
            />
          </label>
          <label className="field field-full">
            <span>Customer Specific Prices</span>
            <input
              name="customerSpecificPricesText"
              value={form.customerSpecificPricesText}
              onChange={onFormChange}
              placeholder="Format: user_abc123:3890, user_xyz789:3750"
            />
          </label>

          <h4 className="form-section">Descriptions & Search</h4>
          <label className="field field-full">
            <span>Short Description</span>
            <textarea
              rows="2"
              name="shortDescription"
              value={form.shortDescription}
              onChange={onFormChange}
            />
          </label>
          <label className="field field-full">
            <span>Full Description</span>
            <textarea
              rows="4"
              name="fullDescription"
              value={form.fullDescription}
              onChange={onFormChange}
            />
          </label>
          <label className="field field-full">
            <span>Technical Keywords (comma separated)</span>
            <input
              name="technicalKeywordsText"
              value={form.technicalKeywordsText}
              onChange={onFormChange}
            />
          </label>
          <label className="field field-full">
            <span>Customer Keywords (comma separated)</span>
            <input
              name="customerKeywordsText"
              value={form.customerKeywordsText}
              onChange={onFormChange}
            />
          </label>
          <label className="field field-full">
            <span>Use Cases (comma separated)</span>
            <input name="useCasesText" value={form.useCasesText} onChange={onFormChange} />
          </label>
          <label className="field field-full">
            <span>Problem Statements (comma separated)</span>
            <input
              name="problemStatementsText"
              value={form.problemStatementsText}
              onChange={onFormChange}
            />
          </label>
          <label className="field field-full">
            <span>Specifications JSON</span>
            <textarea
              rows="6"
              name="specificationsText"
              value={form.specificationsText}
              onChange={onFormChange}
            />
          </label>

          <h4 className="form-section">Google Shopping</h4>
          <label className="field field-full">
            <span>Google Shopping Title</span>
            <input
              name="googleShoppingTitle"
              value={form.googleShoppingTitle}
              onChange={onFormChange}
            />
          </label>
          <label className="field field-full">
            <span>Google Shopping Description</span>
            <textarea
              rows="3"
              name="googleShoppingDescription"
              value={form.googleShoppingDescription}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Google Product Category</span>
            <input
              name="googleProductCategory"
              value={form.googleProductCategory}
              onChange={onFormChange}
            />
          </label>
          <label className="field">
            <span>Product Type</span>
            <input name="productType" value={form.productType} onChange={onFormChange} />
          </label>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Product" : "Create Product"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
