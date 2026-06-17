import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontErrorState,
  StorefrontFileInput,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontSectionHeader,
  StorefrontStickyActionBar,
  StorefrontTextArea
} from "../../shared/storefront/storefront-ui";
import {
  downloadCustomerInvoice,
  getCustomerOrderDetail,
  reorderCustomerOrder,
  submitManualPaymentProof
} from "./account.api";
import {
  canSubmitManualPaymentProof,
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
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading order detail..." />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="proto-main-shell">
        <StorefrontErrorState
          message={error || "Order not found."}
          action={<StorefrontButton to="/account" variant="light">Back to account</StorefrontButton>}
        />
      </main>
    );
  }

  const timeline = Array.isArray(order.shipmentTimeline) ? order.shipmentTimeline : [];
  const tracking = order.trackingDetails;
  const manualInstructions = order.manualPaymentInstructions?.instructions || {};
  const manualInstructionEntries = Object.entries(manualInstructions).filter(([, value]) => Boolean(value));
  const canSubmitManualPayment = canSubmitManualPaymentProof(order);

  return (
    <main className="proto-main-shell account-shell account-order-shell">
      <StorefrontPageHeader
        eyebrow="Order Detail"
        title={order.orderNo}
        description={`Placed on ${formatDate(order.orderDate)}. Manage invoice access, payment proof, reorder actions, and shipment updates from one page.`}
        meta={
          <div className="chip-row">
            <StorefrontBadge className="eyebrow-chip">{humanizeStatus(order.paymentStatus)}</StorefrontBadge>
            <StorefrontBadge className="eyebrow-chip">{humanizeStatus(order.orderStatus)}</StorefrontBadge>
            {order.manualPaymentStatus ? (
              <StorefrontBadge className="eyebrow-chip">{humanizeStatus(order.manualPaymentStatus)}</StorefrontBadge>
            ) : null}
            <StorefrontBadge className="eyebrow-chip">{humanizeStatus(order.shipmentStatus)}</StorefrontBadge>
          </div>
        }
        actions={<StorefrontButton to="/account" variant="light">Back to account</StorefrontButton>}
      />

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <StorefrontCard as="section" className="section-card" elevated>
        <StorefrontSectionHeader
          title="Order Summary"
          description="Commercial status, invoice state, payment method, and shipment reference."
        />
        <div className="detail-pairs">
          <div><span>Grand Total</span><strong>{formatCurrency(order.orderTotal)}</strong></div>
          <div><span>Payment Method</span><strong>{humanizeStatus(order.paymentMethod)}</strong></div>
          <div><span>Customer Type</span><strong>{humanizeStatus(order.customerType)}</strong></div>
          <div><span>Price Group</span><strong>{humanizeStatus(order.priceGroup || "retail")}</strong></div>
          <div><span>Invoice</span><strong>{order.invoice?.invoiceNumber || "Pending"}</strong></div>
          <div><span>Tracking</span><strong>{tracking?.trackingId || "Awaiting shipment"}</strong></div>
        </div>
        <div className="action-row">
          <StorefrontButton type="button" onClick={() => handleReorder("replace")} disabled={busy === "reorder:replace"}>
            {busy === "reorder:replace" ? "Refreshing..." : "Reorder Replace Cart"}
          </StorefrontButton>
          <StorefrontButton type="button" variant="light" onClick={() => handleReorder("merge")} disabled={busy === "reorder:merge"}>
            {busy === "reorder:merge" ? "Refreshing..." : "Reorder Merge Cart"}
          </StorefrontButton>
          <StorefrontButton type="button" variant="light" onClick={handleDownloadInvoice} disabled={!order.invoice?.id}>
            Download Invoice
          </StorefrontButton>
        </div>
      </StorefrontCard>

      {canSubmitManualPayment ? (
        <StorefrontCard as="section" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Submit Bank Transfer Proof"
            description="Admin approval is complete. Upload your UTR and payment screenshot for verification."
          />
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
            <div className="empty-panel">
              Manual payment details are not available on this order yet. Contact support
              before transferring funds.
            </div>
          )}
          <form id="manual-payment-proof-form" className="stack-form" onSubmit={handleManualPaymentSubmit}>
            <div className="field-grid">
              <StorefrontInput
                label="UTR / Reference Number"
                value={manualPaymentForm.utrNumber}
                onChange={(event) =>
                  setManualPaymentForm((current) => ({
                    ...current,
                    utrNumber: event.target.value
                  }))
                }
                required
              />
              <StorefrontFileInput
                label="Payment Screenshot"
                hint="Accepted formats: image or PDF proof."
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
              <StorefrontTextArea
                label="Note"
                fieldClassName="field-span-2"
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
            </div>
            <StorefrontButton type="submit" disabled={busy === "manual-payment"}>
              {busy === "manual-payment" ? "Submitting..." : "Submit Proof"}
            </StorefrontButton>
          </form>
        </StorefrontCard>
      ) : null}

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader title="Items" description="Line-item pricing used on the order." />
          <div className="card-list">
            {order.items.map((item) => (
              <div key={`${item.productId}-${item.sku}`} className="list-card">
                <div className="list-card-head">
                  <div><strong>{item.title}</strong><p>SKU: {item.sku}</p></div>
                  {item.bulkPriceMessage ? <StorefrontBadge className="eyebrow-chip">{item.bulkPriceMessage}</StorefrontBadge> : null}
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
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader title="Pricing Summary" description="Order totals including GST and shipping." />
          <div className="detail-pairs">
            <div><span>Product Subtotal</span><strong>{formatCurrency(order.pricing.productSubtotal)}</strong></div>
            <div><span>Discount</span><strong>{formatCurrency(order.pricing.discountAmount)}</strong></div>
            <div><span>Taxable Value</span><strong>{formatCurrency(order.pricing.taxableValue)}</strong></div>
            <div><span>GST Total</span><strong>{formatCurrency(order.pricing.gstTotal)}</strong></div>
            <div><span>Shipping</span><strong>{formatCurrency(order.pricing.shippingCharge)}</strong></div>
            <div><span>Round Off</span><strong>{formatCurrency(order.pricing.roundOff)}</strong></div>
            <div><span>Grand Total</span><strong>{formatCurrency(order.pricing.grandTotal)}</strong></div>
          </div>
        </StorefrontCard>
      </section>

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader title="Addresses" description="Billing and shipping snapshots captured with the order." />
          <div className="detail-pairs">
            <div><span>Billing</span><strong>{formatAddress(order.billingAddress)}</strong></div>
            <div><span>Shipping</span><strong>{formatAddress(order.shippingAddress)}</strong></div>
          </div>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader title="Tracking Details" description="Shipment details entered by the admin team." />
          {tracking ? (
            <div className="detail-pairs">
              <div><span>Courier</span><strong>{tracking.courierName || "--"}</strong></div>
              <div><span>Tracking ID</span><strong>{tracking.trackingId || "--"}</strong></div>
              <div><span>Dispatch Date</span><strong>{tracking.dispatchDate || "--"}</strong></div>
              <div><span>Expected Delivery</span><strong>{tracking.expectedDeliveryDate || "--"}</strong></div>
              <div><span>Delivered At</span><strong>{tracking.deliveredAt || "--"}</strong></div>
            </div>
          ) : <div className="empty-panel">Shipment has not been created yet.</div>}
        </StorefrontCard>
      </section>

      <StorefrontCard as="section" className="section-card" elevated>
        <StorefrontSectionHeader title="Shipment Timeline" description="Order, payment, and shipping milestones." />
        <div className="timeline-list">
          {timeline.length ? timeline.map((step) => (
            <div key={`${step.code}-${step.at}`} className="timeline-item">
              <strong>{humanizeStatus(step.label)}</strong>
              <span>{formatDateTime(step.at)}</span>
              <p>{step.description}</p>
            </div>
          )) : <div className="empty-panel">Timeline is not available yet.</div>}
        </div>
      </StorefrontCard>

      {reorderSummary ? (
        <StorefrontCard as="section" className="section-card" elevated>
          <StorefrontSectionHeader title="Latest Reorder Calculation" description="Current pricing and stock were recalculated before cart placement." />
          <div className="card-list">
            {reorderSummary.reconciliation.map((item) => (
              <div key={item.productId} className="list-card">
                <div className="list-card-head">
                  <div><strong>{item.title}</strong><p>Qty {item.qty}</p></div>
                  <StorefrontBadge className="eyebrow-chip">{item.priceChanged ? "Price changed" : "Price unchanged"}</StorefrontBadge>
                </div>
                <div className="detail-pairs compact">
                  <div><span>Old Unit Price</span><strong>{formatCurrency(item.oldUnitPrice)}</strong></div>
                  <div><span>Current Unit Price</span><strong>{formatCurrency(item.recalculatedUnitPrice)}</strong></div>
                </div>
              </div>
            ))}
            {reorderSummary.skippedItems.length ? <StorefrontAlert tone="warning">Skipped: {reorderSummary.skippedItems.map((item) => item.title).join(", ")}</StorefrontAlert> : null}
          </div>
        </StorefrontCard>
      ) : null}

      <StorefrontStickyActionBar className="proto-sticky-order-bar">
        <div>
          <span>Order</span>
          <strong>{order.orderNo}</strong>
        </div>
        {canSubmitManualPayment ? (
          <StorefrontButton
            type="submit"
            form="manual-payment-proof-form"
            disabled={busy === "manual-payment"}
          >
            {busy === "manual-payment" ? "Submitting..." : "Submit Proof"}
          </StorefrontButton>
        ) : order.invoice?.id ? (
          <StorefrontButton type="button" onClick={handleDownloadInvoice}>
            Download Invoice
          </StorefrontButton>
        ) : (
          <StorefrontButton
            type="button"
            onClick={() => handleReorder("replace")}
            disabled={busy === "reorder:replace"}
          >
            {busy === "reorder:replace" ? "Refreshing..." : "Reorder"}
          </StorefrontButton>
        )}
      </StorefrontStickyActionBar>
    </main>
  );
}
