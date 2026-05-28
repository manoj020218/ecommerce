import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  downloadCustomerInvoice,
  getCustomerOrderDetail,
  reorderCustomerOrder,
  submitManualPaymentProof
} from "./account.api";
import {
  downloadInvoicePayload,
  formatAddress,
  formatCurrency,
  formatDate,
  formatDateTime,
  humanizeStatus
} from "./account.utils";

function humanizeInstructionKey(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function CustomerOrderPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { clearSession } = useCustomerSession();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [reorderSummary, setReorderSummary] = useState(null);
  const [manualPaymentForm, setManualPaymentForm] = useState({
    utrNumber: "",
    note: "",
    file: null
  });

  function redirectToLogin(requestError) {
    if (requestError?.status !== 401) {
      return false;
    }
    clearSession();
    navigate(`/account/login?redirect=${encodeURIComponent(`/account/orders/${orderId}`)}`, {
      replace: true
    });
    return true;
  }

  async function loadOrder() {
    setLoading(true);
    setError("");
    try {
      setOrder(await getCustomerOrderDetail(orderId));
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Failed to load order detail.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  async function handleDownloadInvoice() {
    if (!order?.invoice?.id) {
      return;
    }
    setError("");
    setNotice("");
    try {
      const payload = await downloadCustomerInvoice(order.invoice.id);
      downloadInvoicePayload(payload);
      setNotice("Invoice download prepared.");
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Invoice download failed.");
      }
    }
  }

  async function handleReorder(mode) {
    setBusy(`reorder:${mode}`);
    setError("");
    setNotice("");
    try {
      const payload = await reorderCustomerOrder(orderId, { mode });
      setReorderSummary(payload);
      setNotice(`Cart refreshed in ${mode} mode using current price, MOQ, GST, shipping, and stock.`);
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Reorder failed.");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleManualPaymentSubmit(event) {
    event.preventDefault();
    if (!manualPaymentForm.file) {
      setError("Payment screenshot is required.");
      return;
    }

    setBusy("manual-payment");
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("orderId", order.id);
      formData.append("paymentMethod", order.paymentMethod || "direct_bank_transfer");
      formData.append("utrNumber", manualPaymentForm.utrNumber);
      formData.append("note", manualPaymentForm.note);
      formData.append("file", manualPaymentForm.file);
      await submitManualPaymentProof(formData);
      setManualPaymentForm({
        utrNumber: "",
        note: "",
        file: null
      });
      setNotice("Payment proof submitted for admin verification.");
      await loadOrder();
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Payment proof submission failed.");
      }
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <main className="front-shell"><div className="state-box">Loading order detail...</div></main>;
  }

  if (!order) {
    return (
      <main className="front-shell">
        <div className="state-box error">{error || "Order not found."}</div>
        <Link to="/account" className="back-link">Back to account</Link>
      </main>
    );
  }

  const timeline = Array.isArray(order.shipmentTimeline) ? order.shipmentTimeline : [];
  const tracking = order.trackingDetails;
  const manualInstructions = order.manualPaymentInstructions?.instructions || {};
  const manualInstructionEntries = Object.entries(manualInstructions).filter(([, value]) => Boolean(value));
  const canSubmitManualPayment = order.orderStatus === "awaiting_bank_payment";

  return (
    <main className="front-shell account-shell">
      <header className="compact-header">
        <Link to="/account" className="back-link">Back to account</Link>
        <p>Order detail</p>
      </header>

      {error ? <div className="state-box error">{error}</div> : null}
      {notice ? <div className="state-box">{notice}</div> : null}

      <section className="section-card">
        <div className="list-card-head">
          <div>
            <p className="eyebrow-text">Order</p>
            <h1 className="order-title">{order.orderNo}</h1>
            <p className="hero-muted">{formatDate(order.orderDate)}</p>
          </div>
          <div className="list-card-meta">
            <span className="eyebrow-chip">{humanizeStatus(order.paymentStatus)}</span>
            <span className="eyebrow-chip">{humanizeStatus(order.orderStatus)}</span>
            {order.manualPaymentStatus ? (
              <span className="eyebrow-chip">{humanizeStatus(order.manualPaymentStatus)}</span>
            ) : null}
            <span className="eyebrow-chip">{humanizeStatus(order.shipmentStatus)}</span>
          </div>
        </div>
        <div className="detail-pairs">
          <div><span>Grand Total</span><strong>{formatCurrency(order.orderTotal)}</strong></div>
          <div><span>Payment Method</span><strong>{humanizeStatus(order.paymentMethod)}</strong></div>
          <div><span>Customer Type</span><strong>{humanizeStatus(order.customerType)}</strong></div>
          <div><span>Price Group</span><strong>{humanizeStatus(order.priceGroup || "retail")}</strong></div>
          <div><span>Invoice</span><strong>{order.invoice?.invoiceNumber || "Pending"}</strong></div>
          <div><span>Tracking</span><strong>{tracking?.trackingId || "Awaiting shipment"}</strong></div>
        </div>
        <div className="action-row">
          <button type="button" className="btn primary" onClick={() => handleReorder("replace")} disabled={busy === "reorder:replace"}>{busy === "reorder:replace" ? "Refreshing..." : "Reorder Replace Cart"}</button>
          <button type="button" className="btn secondary" onClick={() => handleReorder("merge")} disabled={busy === "reorder:merge"}>{busy === "reorder:merge" ? "Refreshing..." : "Reorder Merge Cart"}</button>
          <button type="button" className="btn secondary" onClick={handleDownloadInvoice} disabled={!order.invoice?.id}>Download Invoice</button>
        </div>
      </section>

      {canSubmitManualPayment ? (
        <section className="section-card">
          <div className="section-head">
            <h3>Submit Bank Transfer Proof</h3>
            <p>Admin approval is complete. Upload your UTR and payment screenshot for verification.</p>
          </div>
          {manualInstructionEntries.length ? (
            <div className="detail-pairs">
              {manualInstructionEntries.map(([key, value]) => (
                <div key={key}>
                  <span>{humanizeInstructionKey(key)}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-panel">Payment instructions are not configured yet. Contact support before transferring funds.</div>
          )}
          <form className="stack-form" onSubmit={handleManualPaymentSubmit}>
            <div className="field-grid">
              <label>
                <span>UTR / Reference Number</span>
                <input
                  value={manualPaymentForm.utrNumber}
                  onChange={(event) =>
                    setManualPaymentForm((current) => ({
                      ...current,
                      utrNumber: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label>
                <span>Payment Screenshot</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) =>
                    setManualPaymentForm((current) => ({
                      ...current,
                      file: event.target.files?.[0] || null
                    }))
                  }
                  required
                />
              </label>
              <label className="field-span-2">
                <span>Note</span>
                <textarea
                  value={manualPaymentForm.note}
                  onChange={(event) =>
                    setManualPaymentForm((current) => ({
                      ...current,
                      note: event.target.value
                    }))
                  }
                  rows={3}
                  placeholder="Optional payment note"
                />
              </label>
            </div>
            <button type="submit" className="btn primary" disabled={busy === "manual-payment"}>
              {busy === "manual-payment" ? "Submitting..." : "Submit Proof"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head"><h3>Items</h3><p>Line-item pricing used on the order.</p></div>
          <div className="card-list">
            {order.items.map((item) => (
              <div key={`${item.productId}-${item.sku}`} className="list-card">
                <div className="list-card-head">
                  <div><strong>{item.title}</strong><p>SKU: {item.sku}</p></div>
                  {item.bulkPriceMessage ? <span className="eyebrow-chip">{item.bulkPriceMessage}</span> : null}
                </div>
                <div className="detail-pairs compact">
                  <div><span>Qty</span><strong>{item.qty}</strong></div>
                  <div><span>Unit Price</span><strong>{formatCurrency(item.unitPriceUsed)}</strong></div>
                  <div><span>GST</span><strong>{item.gstRate}%</strong></div>
                  <div><span>Line Total</span><strong>{formatCurrency(item.lineTotal)}</strong></div>
                  <div><span>HSN</span><strong>{item.hsnCode || "--"}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head"><h3>Pricing Summary</h3><p>Order totals including GST and shipping.</p></div>
          <div className="detail-pairs">
            <div><span>Product Subtotal</span><strong>{formatCurrency(order.pricing.productSubtotal)}</strong></div>
            <div><span>Discount</span><strong>{formatCurrency(order.pricing.discountAmount)}</strong></div>
            <div><span>Taxable Value</span><strong>{formatCurrency(order.pricing.taxableValue)}</strong></div>
            <div><span>GST Total</span><strong>{formatCurrency(order.pricing.gstTotal)}</strong></div>
            <div><span>Shipping</span><strong>{formatCurrency(order.pricing.shippingCharge)}</strong></div>
            <div><span>Round Off</span><strong>{formatCurrency(order.pricing.roundOff)}</strong></div>
            <div><span>Grand Total</span><strong>{formatCurrency(order.pricing.grandTotal)}</strong></div>
          </div>
        </article>
      </section>

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head"><h3>Addresses</h3><p>Billing and shipping snapshots captured with the order.</p></div>
          <div className="detail-pairs">
            <div><span>Billing</span><strong>{formatAddress(order.billingAddress)}</strong></div>
            <div><span>Shipping</span><strong>{formatAddress(order.shippingAddress)}</strong></div>
          </div>
        </article>

        <article className="section-card">
          <div className="section-head"><h3>Tracking Details</h3><p>Shipment details entered by the admin team.</p></div>
          {tracking ? (
            <div className="detail-pairs">
              <div><span>Courier</span><strong>{tracking.courierName || "--"}</strong></div>
              <div><span>Tracking ID</span><strong>{tracking.trackingId || "--"}</strong></div>
              <div><span>Dispatch Date</span><strong>{tracking.dispatchDate || "--"}</strong></div>
              <div><span>Expected Delivery</span><strong>{tracking.expectedDeliveryDate || "--"}</strong></div>
              <div><span>Delivered At</span><strong>{tracking.deliveredAt || "--"}</strong></div>
            </div>
          ) : <div className="empty-panel">Shipment has not been created yet.</div>}
        </article>
      </section>

      <section className="section-card">
        <div className="section-head"><h3>Shipment Timeline</h3><p>Order, payment, and shipping milestones.</p></div>
        <div className="timeline-list">
          {timeline.length ? timeline.map((step) => (
            <div key={`${step.code}-${step.at}`} className="timeline-item">
              <strong>{humanizeStatus(step.label)}</strong>
              <span>{formatDateTime(step.at)}</span>
              <p>{step.description}</p>
            </div>
          )) : <div className="empty-panel">Timeline is not available yet.</div>}
        </div>
      </section>

      {reorderSummary ? (
        <section className="section-card">
          <div className="section-head"><h3>Latest Reorder Calculation</h3><p>Current pricing and stock were recalculated before cart placement.</p></div>
          <div className="card-list">
            {reorderSummary.reconciliation.map((item) => (
              <div key={item.productId} className="list-card">
                <div className="list-card-head">
                  <div><strong>{item.title}</strong><p>Qty {item.qty}</p></div>
                  <span className="eyebrow-chip">{item.priceChanged ? "Price changed" : "Price unchanged"}</span>
                </div>
                <div className="detail-pairs compact">
                  <div><span>Old Unit Price</span><strong>{formatCurrency(item.oldUnitPrice)}</strong></div>
                  <div><span>Current Unit Price</span><strong>{formatCurrency(item.recalculatedUnitPrice)}</strong></div>
                </div>
              </div>
            ))}
            {reorderSummary.skippedItems.length ? <div className="state-box warning">Skipped: {reorderSummary.skippedItems.map((item) => item.title).join(", ")}</div> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
