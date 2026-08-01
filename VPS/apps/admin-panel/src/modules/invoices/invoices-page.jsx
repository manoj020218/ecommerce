import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import {
  formatCurrencyInr,
  formatDateTime,
  formatNumber
} from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  fetchInvoice,
  fetchInvoiceDownload,
  fetchInvoiceForOrder,
  fetchInvoices,
  generateInvoice
} from "./invoices.api";

const DEFAULT_FILTERS = {
  orderId: "",
  dateFrom: "",
  dateTo: "",
  limit: 50
};

const DEFAULT_GENERATE_FORM = {
  orderId: "",
  invoiceDate: ""
};

function downloadInvoiceFile(payload) {
  const fileName = payload?.fileName || "invoice.html";
  const contentType = payload?.contentType || "text/html;charset=utf-8";
  const content =
    payload?.content ||
    JSON.stringify(payload?.invoice || payload || {}, null, 2);
  const blob = new Blob([content], {
    type: contentType
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function InvoicesPage() {
  const { session } = useAuthSession();
  const canGenerate = hasPermission(session, "invoices.generate");
  const canDownload = hasPermission(session, "invoices.download");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [generateForm, setGenerateForm] = useState(DEFAULT_GENERATE_FORM);
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);

  const loadInvoices = async (nextFilters = filters) => {
    setError("");
    const data = await fetchInvoices(nextFilters);
    setInvoices(Array.isArray(data) ? data : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadInvoices(DEFAULT_FILTERS);
    } catch (apiError) {
      setError(apiError.message || "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const metrics = useMemo(() => {
    const paidCount = invoices.filter((invoice) => invoice.paymentStatus === "paid").length;
    const lockedCount = invoices.filter((invoice) => invoice.lockedAt).length;
    const totalValue = invoices.reduce(
      (sum, invoice) => sum + Number(invoice.grandTotal || 0),
      0
    );

    return {
      total: invoices.length,
      paidCount,
      lockedCount,
      totalValue
    };
  }, [invoices]);

  const onFilterSubmit = async (event) => {
    event.preventDefault();
    setNotice("");

    try {
      await loadInvoices(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to filter invoices.");
    }
  };

  const openInvoice = async (invoiceId) => {
    setBusyKey(`view:${invoiceId}`);
    setError("");

    try {
      const data = await fetchInvoice(invoiceId);
      setSelectedInvoice(data);
      setInvoiceModalOpen(true);
    } catch (apiError) {
      setError(apiError.message || "Failed to load invoice detail.");
    } finally {
      setBusyKey("");
    }
  };

  const downloadInvoice = async (invoiceId) => {
    setBusyKey(`download:${invoiceId}`);
    setError("");
    setNotice("");

    try {
      const data = await fetchInvoiceDownload(invoiceId);
      downloadInvoiceFile(data);
      setNotice(`Download ready: ${data.fileName || `${invoiceId}.html`}`);
    } catch (apiError) {
      setError(apiError.message || "Failed to download invoice.");
    } finally {
      setBusyKey("");
    }
  };

  const openInvoiceForOrder = async () => {
    if (!generateForm.orderId) {
      setError("Enter an order ID or order number first.");
      return;
    }

    setBusyKey("lookup-order");
    setError("");

    try {
      const data = await fetchInvoiceForOrder(generateForm.orderId);
      setSelectedInvoice(data);
      setInvoiceModalOpen(true);
    } catch (apiError) {
      setError(apiError.message || "Failed to load order invoice.");
    } finally {
      setBusyKey("");
    }
  };

  const onGenerateInvoice = async () => {
    if (!generateForm.orderId) {
      setError("Enter an order ID or order number first.");
      return;
    }

    setBusyKey("generate");
    setError("");
    setNotice("");

    try {
      const result = await generateInvoice(generateForm.orderId, {
        invoiceDate: generateForm.invoiceDate || undefined
      });
      await loadInvoices(filters);
      setSelectedInvoice(result.invoice);
      setInvoiceModalOpen(true);
      const label = result.invoice?.documentType === "proforma_invoice" ? "Proforma Invoice" : "Tax Invoice";
      setNotice(
        result.created
          ? `${label} generated: ${result.invoice?.invoiceNumber || generateForm.orderId}`
          : `Existing ${label.toLowerCase()} opened: ${result.invoice?.invoiceNumber || generateForm.orderId}`
      );
    } catch (apiError) {
      setError(apiError.message || "Failed to generate invoice.");
    } finally {
      setBusyKey("");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading invoices..." />;
  }

  if (error && invoices.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Invoices"
        description="Invoice registry for GST documents, payment-linked generation, and printable HTML downloads."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Invoices</p>
          <h3>{formatNumber(metrics.total)}</h3>
          <span>Total visible documents</span>
        </article>
        <article className="summary-card">
          <p>Paid</p>
          <h3>{formatNumber(metrics.paidCount)}</h3>
          <span>Payment-confirmed invoices</span>
        </article>
        <article className="summary-card">
          <p>Locked</p>
          <h3>{formatNumber(metrics.lockedCount)}</h3>
          <span>Documents marked final</span>
        </article>
        <article className="summary-card">
          <p>Grand Total</p>
          <h3>{formatCurrencyInr(metrics.totalValue)}</h3>
          <span>Combined invoice value</span>
        </article>
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <form className="form-grid wide" onSubmit={onFilterSubmit}>
          <label className="field">
            <span>Order ID / Order No</span>
            <input
              value={filters.orderId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  orderId: event.target.value
                }))
              }
            />
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
          <label className="field">
            <span>Limit</span>
            <input
              type="number"
              min="1"
              max="200"
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
              Apply Filters
            </button>
          </div>
        </form>
      </section>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Order Invoice Actions</h3>
            <p className="muted">Look up the invoice for a paid order or generate one manually when required.</p>
          </div>
        </div>
        <form className="form-grid wide" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>Order ID / Order No</span>
            <input
              value={generateForm.orderId}
              onChange={(event) =>
                setGenerateForm((current) => ({
                  ...current,
                  orderId: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Invoice Date</span>
            <input
              type="date"
              value={generateForm.invoiceDate}
              onChange={(event) =>
                setGenerateForm((current) => ({
                  ...current,
                  invoiceDate: event.target.value
                }))
              }
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openInvoiceForOrder}
              disabled={busyKey === "lookup-order"}
            >
              {busyKey === "lookup-order" ? "Opening..." : "Open Existing"}
            </button>
            {canGenerate ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onGenerateInvoice}
                disabled={busyKey === "generate"}
              >
                {busyKey === "generate" ? "Working..." : "Generate Invoice"}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {invoices.length === 0 ? (
        <EmptyBlock
          title="No invoices matched the selected filters."
          description="Generate an invoice from a paid order or broaden the search criteria."
        />
      ) : null}

      {invoices.length > 0 ? (
        <>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Grand Total</th>
                  <th>Generated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.invoiceNumber}</strong>
                      <p className="row-sub">{invoice.financialYearLabel || "n/a"}</p>
                    </td>
                    <td>{invoice.orderNo || invoice.orderId}</td>
                    <td>{invoice.customerName || "Customer"}</td>
                    <td>
                      <StatusBadge value={invoice.documentType || "tax_invoice"} />{" "}
                      <StatusBadge value={invoice.paymentStatus || "pending"} />
                    </td>
                    <td>{formatCurrencyInr(invoice.grandTotal || 0)}</td>
                    <td>{formatDateTime(invoice.generatedAt || invoice.invoiceDate)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => openInvoice(invoice.id)}
                        disabled={busyKey === `view:${invoice.id}`}
                      >
                        {busyKey === `view:${invoice.id}` ? "Opening..." : "View"}
                      </button>
                      {canDownload ? (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => downloadInvoice(invoice.id)}
                          disabled={busyKey === `download:${invoice.id}`}
                        >
                          {busyKey === `download:${invoice.id}` ? "Preparing..." : "Download"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {invoices.map((invoice) => (
              <article key={invoice.id} className="card">
                <div className="card-head">
                  <h4>{invoice.invoiceNumber}</h4>
                  <StatusBadge value={invoice.documentType || "tax_invoice"} />
                </div>
                <p className="muted">{invoice.orderNo || invoice.orderId}</p>
                <p className="muted">{invoice.customerName || "Customer"}</p>
                <p className="muted">{formatCurrencyInr(invoice.grandTotal || 0)}</p>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openInvoice(invoice.id)}
                    disabled={busyKey === `view:${invoice.id}`}
                  >
                    View Invoice
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      <Modal
        title={selectedInvoice?.invoiceNumber || "Invoice"}
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        width="960px"
      >
        {selectedInvoice ? (
          <section className="stack">
            <div className="summary-grid">
              <article className="summary-card">
                <p>Order</p>
                <h3>{selectedInvoice.orderNo || selectedInvoice.orderId}</h3>
                <span>{selectedInvoice.invoiceDate || "n/a"}</span>
              </article>
              <article className="summary-card">
                <p>Buyer</p>
                <h3>{selectedInvoice.buyer?.companyName || selectedInvoice.buyer?.name || "Customer"}</h3>
                <span>{selectedInvoice.buyer?.gstin || "No GSTIN"}</span>
              </article>
              <article className="summary-card">
                <p>Grand Total</p>
                <h3>{formatCurrencyInr(selectedInvoice.pricing?.grandTotal || 0)}</h3>
                <span>{selectedInvoice.paymentStatus || "pending"}</span>
              </article>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Taxable</th>
                    <th>GST</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedInvoice.items || []).map((item) => (
                    <tr key={`${item.productId}-${item.sku}`}>
                      <td>
                        <strong>{item.title}</strong>
                        <p className="row-sub">{item.sku || item.productId}</p>
                      </td>
                      <td>{formatNumber(item.qty || 0)}</td>
                      <td>{formatCurrencyInr(item.taxableValue || 0)}</td>
                      <td>{formatCurrencyInr(item.gstAmount || 0)}</td>
                      <td>{formatCurrencyInr(item.lineTotal || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </Modal>
    </section>
  );
}
