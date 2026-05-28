import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { formatCurrencyInr, formatDateTime, formatNumber } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { downloadReport, fetchReport } from "./reports.api";

const REPORT_OPTIONS = [
  { key: "sales", label: "Sales Report" },
  { key: "invoices", label: "Invoice Report" },
  { key: "gst", label: "GST Report" },
  { key: "payments", label: "Payment Report" },
  { key: "shipping", label: "Shipping Report" },
  { key: "dealer-sales", label: "Dealer / Stockist Sales" },
  { key: "product-sales", label: "Product Sales" },
  { key: "city-pincode-orders", label: "City / Pincode Orders" },
  { key: "abandoned-carts", label: "Abandoned Carts" },
  { key: "marketing-offers", label: "Marketing Offers" },
  { key: "inventory", label: "Inventory" }
];

const DEFAULT_FILTERS = {
  period: "monthly",
  month: "2026-05",
  year: 2026,
  dateFrom: "",
  dateTo: "",
  city: "",
  pincode: "",
  state: "",
  courier: "",
  customerType: "",
  paymentStatus: "",
  orderStatus: "",
  shipmentStatus: "",
  limit: 200
};

function formatMetricLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatMetricValue(key, value) {
  if (typeof value !== "number") {
    return value;
  }

  if (/(total|amount|shipping|discount|gst|revenue)/i.test(key)) {
    return formatCurrencyInr(value);
  }

  return formatNumber(value);
}

function triggerDownload({ blob, fileName }) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { session } = useAuthSession();
  const canExport = hasPermission(session, "reports.export");
  const [loading, setLoading] = useState(true);
  const [busyExport, setBusyExport] = useState("");
  const [reportKey, setReportKey] = useState("sales");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReport = async (nextReportKey = reportKey, nextFilters = filters) => {
    setError("");
    const data = await fetchReport(nextReportKey, nextFilters);
    setReport(data);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadReport("sales", DEFAULT_FILTERS);
    } catch (apiError) {
      setError(apiError.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setNotice("");

    try {
      await loadReport(reportKey, filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to generate report.");
    }
  };

  const onExport = async (format) => {
    setBusyExport(format);
    setNotice("");
    setError("");

    try {
      const data = await downloadReport(reportKey, filters, format);
      triggerDownload(data);
      setNotice(`Download ready: ${data.fileName}`);
    } catch (apiError) {
      setError(apiError.message || "Failed to download report.");
    } finally {
      setBusyExport("");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading reports..." />;
  }

  if (error && !report) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Reports"
        description="Phase 16 exports for sales, invoices, GST, shipping, geography, inventory, and marketing."
        actions={
          canExport && report ? (
            <>
              {report.availableFormats.map((format) => (
                <button
                  key={format}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onExport(format)}
                  disabled={busyExport.length > 0}
                >
                  {busyExport === format ? "Preparing..." : format}
                </button>
              ))}
            </>
          ) : null
        }
      />

      <section className="summary-card">
        <form className="form-grid wide" onSubmit={onSubmit}>
          <label className="field">
            <span>Report</span>
            <select
              value={reportKey}
              onChange={(event) => setReportKey(event.target.value)}
            >
              {REPORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Period</span>
            <select
              value={filters.period}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  period: event.target.value
                }))
              }
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom Range</option>
            </select>
          </label>

          {filters.period === "monthly" ? (
            <label className="field">
              <span>Month</span>
              <input
                type="month"
                value={filters.month}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    month: event.target.value
                  }))
                }
              />
            </label>
          ) : null}

          {filters.period === "yearly" ? (
            <label className="field">
              <span>Year</span>
              <input
                type="number"
                min="2020"
                max="2100"
                value={filters.year}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    year: event.target.value
                  }))
                }
              />
            </label>
          ) : null}

          {filters.period === "custom" ? (
            <>
              <label className="field">
                <span>Date From</span>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      dateFrom: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Date To</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      dateTo: event.target.value
                    }))
                  }
                />
              </label>
            </>
          ) : null}

          <label className="field">
            <span>City</span>
            <input
              value={filters.city}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  city: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Pincode</span>
            <input
              value={filters.pincode}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  pincode: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>State</span>
            <input
              value={filters.state}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  state: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Courier</span>
            <input
              value={filters.courier}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  courier: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Customer Type</span>
            <input
              value={filters.customerType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  customerType: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Payment Status</span>
            <input
              value={filters.paymentStatus}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  paymentStatus: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Order Status</span>
            <input
              value={filters.orderStatus}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  orderStatus: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Shipment Status</span>
            <input
              value={filters.shipmentStatus}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  shipmentStatus: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Limit</span>
            <input
              type="number"
              min="1"
              max="5000"
              value={filters.limit}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  limit: event.target.value
                }))
              }
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Generate Report
            </button>
          </div>
        </form>
      </section>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {report ? (
        <div className="summary-grid">
          {Object.entries(report.summary || {}).map(([key, value]) => (
            <article key={key} className="summary-card">
              <p>{formatMetricLabel(key)}</p>
              <h3>{formatMetricValue(key, value)}</h3>
              <span>{report.title}</span>
            </article>
          ))}
        </div>
      ) : null}

      {report ? (
        <section className="summary-card">
          <p className="muted">
            Generated {formatDateTime(report.generatedAt)} for {report.filters.dateFrom} to{" "}
            {report.filters.dateTo}
          </p>
        </section>
      ) : null}

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              {report?.columns?.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report?.rows?.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row[report.columns[0]?.key] || "row"}`}>
                {report.columns.map((column) => (
                  <td key={column.key}>{String(row[column.key] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {report?.rows?.map((row, rowIndex) => (
          <article key={`${rowIndex}-${row[report.columns[0]?.key] || "row"}`} className="card">
            <div className="card-head">
              <h4>{String(row[report.columns[0]?.key] ?? "Row")}</h4>
            </div>
            {report.columns.slice(1).map((column) => (
              <p key={column.key} className="muted">
                {column.label}: {String(row[column.key] ?? "")}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
