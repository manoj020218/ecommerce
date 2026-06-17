import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import {
  formatCurrencyInr,
  formatDateTime,
  formatNumber
} from "../../shared/utils/formatters";
import { fetchTallyExport } from "./tally-export.api";

const DEFAULT_FILTERS = {
  period: "monthly",
  dateFrom: "",
  dateTo: ""
};

function downloadTextFile(fileName, contents, contentType = "text/plain;charset=utf-8") {
  const blob = new Blob([contents], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function TallyExportPage() {
  const [loading, setLoading] = useState(true);
  const [busyDownload, setBusyDownload] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportPayload, setExportPayload] = useState(null);

  const loadExport = async (nextFilters = filters) => {
    setError("");
    const data = await fetchTallyExport(nextFilters);
    setExportPayload(data);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadExport(DEFAULT_FILTERS);
    } catch (apiError) {
      setError(apiError.message || "Failed to generate tally export.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const totals = useMemo(() => exportPayload?.totals || {}, [exportPayload]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setNotice("");

    try {
      await loadExport(filters);
      setNotice("Tally export regenerated.");
    } catch (apiError) {
      setError(apiError.message || "Failed to generate tally export.");
    }
  };

  const onDownload = async () => {
    if (!exportPayload?.csv) {
      return;
    }

    setBusyDownload(true);
    try {
      downloadTextFile(
        exportPayload.fileName || "tally-export.csv",
        exportPayload.csv,
        "text/csv;charset=utf-8"
      );
      setNotice(`Download ready: ${exportPayload.fileName}`);
    } finally {
      setBusyDownload(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Generating tally export..." />;
  }

  if (error && !exportPayload) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Tally Export"
        description="Dedicated export workspace for invoice-led CSV output used for Tally ingestion."
        actions={
          exportPayload ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onDownload}
              disabled={busyDownload}
            >
              {busyDownload ? "Preparing..." : "Download CSV"}
            </button>
          ) : null
        }
      />

      <section className="summary-card">
        <form className="form-grid wide" onSubmit={onSubmit}>
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
            </select>
          </label>
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
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Generate Export
            </button>
          </div>
        </form>
      </section>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {exportPayload ? (
        <div className="summary-grid">
          <article className="summary-card">
            <p>Rows</p>
            <h3>{formatNumber(exportPayload.rowCount || 0)}</h3>
            <span>{exportPayload.period || "period"} export</span>
          </article>
          <article className="summary-card">
            <p>Grand Total</p>
            <h3>{formatCurrencyInr(totals.grandTotal || 0)}</h3>
            <span>Invoice total exported</span>
          </article>
          <article className="summary-card">
            <p>Taxable Value</p>
            <h3>{formatCurrencyInr(totals.taxableValue || 0)}</h3>
            <span>Before tax and shipping</span>
          </article>
          <article className="summary-card">
            <p>Tax Total</p>
            <h3>
              {formatCurrencyInr(
                (totals.cgstTotal || 0) +
                  (totals.sgstTotal || 0) +
                  (totals.igstTotal || 0)
              )}
            </h3>
            <span>CGST + SGST + IGST</span>
          </article>
        </div>
      ) : null}

      {exportPayload ? (
        <section className="summary-card">
          <p className="muted">
            Generated {formatDateTime(exportPayload.generatedAt)}. Format: {exportPayload.format}.
            XML-ready: {exportPayload.xmlReady ? "Yes" : "No"}.
          </p>
        </section>
      ) : null}

      {!exportPayload?.rows?.length ? (
        <EmptyBlock
          title="No invoices matched the selected export range."
          description="Adjust the period or dates and regenerate the export."
        />
      ) : null}

      {exportPayload?.rows?.length ? (
        <>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Voucher Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>GSTIN</th>
                  <th>Taxable</th>
                  <th>Tax</th>
                  <th>Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {exportPayload.rows.map((row) => (
                  <tr key={`${row.invoiceNumber}-${row.orderNumber}`}>
                    <td>{row.voucherDate || "n/a"}</td>
                    <td>
                      <strong>{row.invoiceNumber}</strong>
                      <p className="row-sub">{row.orderNumber || "No order number"}</p>
                    </td>
                    <td>{row.partyName || "Customer"}</td>
                    <td>{row.partyGstin || "n/a"}</td>
                    <td>{formatCurrencyInr(row.taxableValue || 0)}</td>
                    <td>
                      {formatCurrencyInr(
                        Number(row.cgstTotal || 0) +
                          Number(row.sgstTotal || 0) +
                          Number(row.igstTotal || 0)
                      )}
                    </td>
                    <td>{formatCurrencyInr(row.grandTotal || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {exportPayload.rows.map((row) => (
              <article key={`${row.invoiceNumber}-${row.orderNumber}`} className="card">
                <div className="card-head">
                  <h4>{row.invoiceNumber}</h4>
                  <strong>{formatCurrencyInr(row.grandTotal || 0)}</strong>
                </div>
                <p className="muted">{row.partyName || "Customer"}</p>
                <p className="muted">{row.orderNumber || "No order number"}</p>
                <p className="muted">{row.voucherDate || "n/a"}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
