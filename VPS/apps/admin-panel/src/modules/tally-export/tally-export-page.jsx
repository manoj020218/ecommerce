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
import {
  fetchTallyExport,
  fetchTallyExportDownload,
  fetchTallyExportHistory
} from "./tally-export.api";

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
  const [downloadingId, setDownloadingId] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportPayload, setExportPayload] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await fetchTallyExportHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setHistoryError(apiError.message || "Failed to load past exports.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadHistory();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const totals = useMemo(() => exportPayload?.totals || {}, [exportPayload]);

  // Generating writes a new, permanently downloadable line item to the
  // history list below -- it doesn't need to be downloaded again right away
  // from this preview, and re-generating for the same range later makes a
  // fresh, separately dated entry rather than overwriting the old one, so an
  // accountant who already has a file from a past export keeps a stable copy.
  const onSubmit = async (event) => {
    event.preventDefault();
    setNotice("");
    setError("");

    try {
      const data = await fetchTallyExport(filters);
      setExportPayload(data);
      setNotice(`Export ready — saved to the list below as "${data.fileName}". Click Download there anytime.`);
      await loadHistory();
    } catch (apiError) {
      setError(apiError.message || "Failed to generate tally export.");
    }
  };

  const onDownloadHistoryRow = async (row) => {
    setDownloadingId(row.id);
    setHistoryError("");
    try {
      const csv = await fetchTallyExportDownload(row.id);
      downloadTextFile(row.fileName || "tally-export.csv", csv, "text/csv;charset=utf-8");
    } catch (apiError) {
      setHistoryError(apiError.message || "Failed to download this export.");
    } finally {
      setDownloadingId("");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading tally export history..." />;
  }

  if (error && !exportPayload) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Tally Export"
        description="Generate a CSV for a date range below, then download it any time from the list — regenerating never overwrites a past export, so a file already sent to the accountant stays exactly as sent."
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

      <section className="summary-card">
        <h3 style={{ marginTop: 0 }}>Past Exports</h3>
        {historyError ? <p className="form-error">{historyError}</p> : null}
        {historyLoading ? (
          <p className="muted">Loading...</p>
        ) : !history.length ? (
          <EmptyBlock
            title="No exports generated yet."
            description="Use the form above to generate the first one — it will appear here, ready to download."
          />
        ) : (
          <>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>Date Range</th>
                    <th>Invoices</th>
                    <th>Total</th>
                    <th>Generated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>
                          {row.dateFrom || "—"} to {row.dateTo || "—"}
                        </strong>
                        <p className="row-sub">{row.period}</p>
                      </td>
                      <td>{formatNumber(row.rowCount || 0)}</td>
                      <td>{formatCurrencyInr(row.totalGrandTotal || 0)}</td>
                      <td>{formatDateTime(row.generatedAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => onDownloadHistoryRow(row)}
                          disabled={downloadingId === row.id}
                        >
                          {downloadingId === row.id ? "Preparing..." : "Download"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards">
              {history.map((row) => (
                <article key={row.id} className="card">
                  <div className="card-head">
                    <h4>
                      {row.dateFrom || "—"} to {row.dateTo || "—"}
                    </h4>
                    <strong>{formatCurrencyInr(row.totalGrandTotal || 0)}</strong>
                  </div>
                  <p className="muted">
                    {row.period} · {formatNumber(row.rowCount || 0)} rows
                  </p>
                  <p className="muted">Generated {formatDateTime(row.generatedAt)}</p>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onDownloadHistoryRow(row)}
                      disabled={downloadingId === row.id}
                    >
                      {downloadingId === row.id ? "Preparing..." : "Download"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {exportPayload ? (
        <div className="summary-grid">
          <article className="summary-card">
            <p>Invoices</p>
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

      {exportPayload && !exportPayload.rows?.length ? (
        <EmptyBlock
          title="No invoices matched the selected export range."
          description="Adjust the period or dates and regenerate the export."
        />
      ) : null}

      {exportPayload?.rows?.length ? (
        <>
          <p className="muted">
            One row per product line, plus a "Shipping Charges" line per invoice carrying that
            invoice's discount, shipping, round-off and grand total — those figures only appear
            once per invoice so column totals don't double-count.
          </p>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Voucher Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>HSN</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Taxable</th>
                  <th>Tax</th>
                  <th>Discount</th>
                  <th>Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {exportPayload.rows.map((row, index) => (
                  <tr key={`${row.invoiceNumber}-${index}`}>
                    <td>{row.voucherDate || "n/a"}</td>
                    <td>
                      <strong>{row.invoiceNumber}</strong>
                      <p className="row-sub">{row.orderNumber || "No order number"}</p>
                    </td>
                    <td>{row.partyName || "Customer"}</td>
                    <td>{row.productName}</td>
                    <td>{row.hsnCode || "—"}</td>
                    <td>{row.qty ?? "—"}</td>
                    <td>{formatCurrencyInr(row.unitRate || 0)}</td>
                    <td>{formatCurrencyInr(row.taxableValue || 0)}</td>
                    <td>
                      {formatCurrencyInr(
                        Number(row.cgstTotal || 0) +
                          Number(row.sgstTotal || 0) +
                          Number(row.igstTotal || 0)
                      )}
                    </td>
                    <td>{row.discountAmount === "" ? "—" : formatCurrencyInr(row.discountAmount || 0)}</td>
                    <td>{row.grandTotal === "" ? "—" : formatCurrencyInr(row.grandTotal || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {exportPayload.rows.map((row, index) => (
              <article key={`${row.invoiceNumber}-${index}`} className="card">
                <div className="card-head">
                  <h4>{row.invoiceNumber}</h4>
                  <strong>
                    {row.grandTotal === "" ? formatCurrencyInr(row.taxableValue || 0) : formatCurrencyInr(row.grandTotal || 0)}
                  </strong>
                </div>
                <p className="muted">{row.partyName || "Customer"}</p>
                <p className="muted">{row.productName} {row.hsnCode ? `· HSN ${row.hsnCode}` : ""}</p>
                <p className="muted">
                  Qty {row.qty ?? "—"} · Rate {formatCurrencyInr(row.unitRate || 0)}
                </p>
                <p className="muted">{row.orderNumber || "No order number"} · {row.voucherDate || "n/a"}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
