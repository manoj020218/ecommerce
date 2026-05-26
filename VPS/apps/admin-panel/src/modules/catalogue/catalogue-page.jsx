import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { formatDateTime, formatNumber } from "../../shared/utils/formatters";
import {
  exportCatalogueProducts,
  fetchCatalogueSummary,
  importProductsPlaceholder
} from "./catalogue.api";

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CataloguePage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCatalogueSummary();
      setSummary(data);
    } catch (apiError) {
      setError(apiError.message || "Failed to load catalogue summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onExport = async (includeInactive) => {
    setBusyAction("export");
    setNotice("");
    try {
      const payload = await exportCatalogueProducts(includeInactive);
      const suffix = includeInactive ? "all" : "active";
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadJson(`catalogue-products-${suffix}-${timestamp}.json`, payload);
      setNotice(
        `Export ready: ${formatNumber(payload.count)} products at ${formatDateTime(payload.exportedAt)}`
      );
    } catch (apiError) {
      setError(apiError.message || "Export failed.");
    } finally {
      setBusyAction("");
    }
  };

  const onImportPlaceholder = async () => {
    setBusyAction("import");
    setNotice("");
    try {
      await importProductsPlaceholder();
    } catch (apiError) {
      setNotice(
        apiError.message ||
          "Import workflow is placeholder and will be completed in Phase 4."
      );
    } finally {
      setBusyAction("");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading catalogue summary..." />;
  }

  if (error) {
    return <ErrorBlock message={error} onRetry={load} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Catalogue Summary"
        description="Phase 3 admin wiring for categories, products, HSN, and inventory."
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onExport(false)}
              disabled={busyAction.length > 0}
            >
              {busyAction === "export" ? "Exporting..." : "Export Active"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onExport(true)}
              disabled={busyAction.length > 0}
            >
              Export All
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onImportPlaceholder}
              disabled={busyAction.length > 0}
            >
              {busyAction === "import" ? "Checking..." : "Import Placeholder"}
            </button>
          </>
        }
      />

      {notice ? <p className="alert-info">{notice}</p> : null}

      <div className="summary-grid">
        <article className="summary-card">
          <p>Products</p>
          <h3>{formatNumber(summary?.products?.total)}</h3>
          <span>
            Active: {formatNumber(summary?.products?.active)} | Inactive:{" "}
            {formatNumber(summary?.products?.inactive)}
          </span>
        </article>

        <article className="summary-card">
          <p>Categories</p>
          <h3>{formatNumber(summary?.categories?.total)}</h3>
          <span>
            Active: {formatNumber(summary?.categories?.active)} | Inactive:{" "}
            {formatNumber(summary?.categories?.inactive)}
          </span>
        </article>

        <article className="summary-card">
          <p>HSN / Tax Master</p>
          <h3>{formatNumber(summary?.hsnTax?.total)}</h3>
          <span>Active: {formatNumber(summary?.hsnTax?.active)}</span>
        </article>
      </div>

      <section className="module-links">
        <Link to="/categories" className="module-link">
          <h4>Categories</h4>
          <p>Create/edit parent-child categories and active state.</p>
        </Link>
        <Link to="/products" className="module-link">
          <h4>Products</h4>
          <p>Manage full Phase 3 product fields, pricing, and stock metadata.</p>
        </Link>
        <Link to="/hsn-tax" className="module-link">
          <h4>HSN / Tax</h4>
          <p>Maintain GST/CGST/SGST/IGST rules and effective date records.</p>
        </Link>
        <Link to="/inventory" className="module-link">
          <h4>Inventory</h4>
          <p>Track stock, reserved quantity, low-stock alerts, and adjustments.</p>
        </Link>
      </section>
    </section>
  );
}
