import { useEffect, useState } from "react";
import { useAuthSession } from "../auth/use-auth-session";
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
import { fetchOrderDetail, fetchOrders } from "./orders.api";

const DEFAULT_FILTERS = {
  q: "",
  channel: "",
  status: "",
  paymentStatus: "",
  shipmentStatus: "",
  paymentMethod: "",
  customerType: "",
  invoiceStatus: "",
  limit: 50
};

const EMPTY_SUMMARY = {
  totalCount: 0,
  storefrontCount: 0,
  walkInCount: 0,
  b2bRequestCount: 0,
  unpaidCount: 0,
  invoicePendingCount: 0
};

const CHANNEL_OPTIONS = [
  { value: "", label: "All Channels" },
  { value: "storefront", label: "Storefront" },
  { value: "walk_in", label: "Walk-in" },
  { value: "b2b_request", label: "B2B Request" }
];

const INVOICE_OPTIONS = [
  { value: "", label: "All Invoice States" },
  { value: "generated", label: "Generated" },
  { value: "pending", label: "Pending" }
];

function humanize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase()) || "N/A";
}

function formatAddress(address) {
  const parts = [
    address?.companyName,
    address?.name,
    address?.addressLine1,
    address?.addressLine2,
    address?.city,
    address?.state,
    address?.stateCode,
    address?.pincode,
    address?.country
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "N/A";
}

function buildWaLink(phone, message) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function WaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 2a10 10 0 00-8.7 15l-1.2 5 5.1-1.3A10 10 0 1012 2zm5.1 13.4c-.2.6-1.2 1.2-1.7 1.3-.5.1-1.1.2-3.1-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3 1 1.7 2.4 2.7 1.8 1.3 3.3 1.7 3.7 1.9.4.2.7.1.9-.1.3-.3 1-.9 1.2-1.2.2-.3.4-.3.7-.2l1.8.9c.3.2.5.3.6.5.1.2.1.9-.1 1.4z" />
    </svg>
  );
}

function channelDescription(row) {
  if (row.channel === "walk_in") {
    return "Created from the walk-in orders workspace.";
  }
  if (row.channel === "b2b_request") {
    return "Dealer/B2B order request created from storefront checkout.";
  }
  return "Standard storefront checkout order.";
}

export function OrdersPage() {
  const { session } = useAuthSession();
  const canView = hasPermission(session, "orders.view");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [ordersState, setOrdersState] = useState({
    summary: EMPTY_SUMMARY,
    rows: []
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const loadOrders = async (nextFilters = filters) => {
    setError("");
    const data = await fetchOrders(nextFilters);
    setOrdersState({
      summary: data?.summary || EMPTY_SUMMARY,
      rows: Array.isArray(data?.rows) ? data.rows : []
    });
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    setFilters(DEFAULT_FILTERS);

    try {
      await loadOrders(DEFAULT_FILTERS);
    } catch (apiError) {
      setError(apiError.message || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();

    try {
      await loadOrders(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to filter orders.");
    }
  };

  const openDetail = async (orderId) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setSelectedOrder(null);

    try {
      setSelectedOrder(await fetchOrderDetail(orderId));
    } catch (apiError) {
      setDetailError(apiError.message || "Failed to load order detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  if (!canView) {
    return <ErrorBlock message="You do not have permission to view orders." />;
  }

  if (loading) {
    return <LoadingBlock label="Loading orders..." />;
  }

  if (error && ordersState.rows.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Orders"
        description="Central order workspace for storefront, B2B request, and walk-in channels. Shipping, manual payment verification, and walk-in editing remain in their dedicated modules."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Visible Orders</p>
          <h3>{formatNumber(ordersState.summary.totalCount)}</h3>
          <span>Rows matching the current filters</span>
        </article>
        <article className="summary-card">
          <p>Storefront</p>
          <h3>{formatNumber(ordersState.summary.storefrontCount)}</h3>
          <span>Standard online checkout orders</span>
        </article>
        <article className="summary-card">
          <p>Walk-in</p>
          <h3>{formatNumber(ordersState.summary.walkInCount)}</h3>
          <span>Offline counter or manual admin orders</span>
        </article>
        <article className="summary-card">
          <p>B2B Requests</p>
          <h3>{formatNumber(ordersState.summary.b2bRequestCount)}</h3>
          <span>Dealer or approval-driven order requests</span>
        </article>
        <article className="summary-card">
          <p>Attention</p>
          <h3>{formatNumber(ordersState.summary.unpaidCount + ordersState.summary.invoicePendingCount)}</h3>
          <span>Unpaid or invoice-pending orders</span>
        </article>
      </div>

      <section className="alert-panel">
        <h4>Workspace Routing</h4>
        <div className="alert-chips">
          <span className="alert-chip">Orders: cross-channel visibility and detail</span>
          <span className="alert-chip">Shipping: courier and fulfilment updates</span>
          <span className="alert-chip">Walk-in Orders: offline payment + invoice workflow</span>
          <span className="alert-chip">Customers: B2B approval and dealer order requests</span>
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <form className="form-grid wide" onSubmit={onSubmit}>
          <label className="field">
            <span>Search</span>
            <input
              value={filters.q}
              placeholder="Order no, customer, SKU, invoice, tracking"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  q: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Channel</span>
            <select
              value={filters.channel}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  channel: event.target.value
                }))
              }
            >
              {CHANNEL_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Order Status</span>
            <input
              value={filters.status}
              placeholder="placed, dispatched, delivered"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Payment Status</span>
            <input
              value={filters.paymentStatus}
              placeholder="paid, pending"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  paymentStatus: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Shipment Status</span>
            <input
              value={filters.shipmentStatus}
              placeholder="pending_packing, shipped"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  shipmentStatus: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Payment Method</span>
            <input
              value={filters.paymentMethod}
              placeholder="online, direct_bank_transfer"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  paymentMethod: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Customer Type</span>
            <input
              value={filters.customerType}
              placeholder="retail, dealer, stockist"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  customerType: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Invoice Status</span>
            <select
              value={filters.invoiceStatus}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  invoiceStatus: event.target.value
                }))
              }
            >
              {INVOICE_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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

      {ordersState.rows.length === 0 ? (
        <EmptyBlock
          title="No orders matched the selected filters."
          description="Broaden the search or refresh after new orders are created."
        />
      ) : (
        <>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Channel</th>
                  <th>Customer</th>
                  <th>Statuses</th>
                  <th>Total</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ordersState.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.orderNo || row.id}</strong>
                      <p className="row-sub">
                        {row.itemCount} item(s) / {humanize(row.paymentMethod)}
                      </p>
                    </td>
                    <td>
                      <StatusBadge value={row.channel} label={humanize(row.channel)} />
                      <p className="row-sub">{channelDescription(row)}</p>
                    </td>
                    <td>
                      <strong>{row.customerName}</strong>
                      <p className="row-sub">{row.customerEmail || row.customerMobile || "No contact captured"}</p>
                      {row.companyName ? <p className="row-sub">{row.companyName}</p> : null}
                    </td>
                    <td>
                      <div className="status-stack">
                        <StatusBadge value={row.paymentStatus} />
                        <StatusBadge value={row.orderStatus} />
                        <StatusBadge value={row.shipmentStatus} />
                        <StatusBadge value={row.invoiceStatus} />
                      </div>
                    </td>
                    <td>
                      <strong>{formatCurrencyInr(row.orderTotal)}</strong>
                      <p className="row-sub">{humanize(row.customerType)}</p>
                    </td>
                    <td>{formatDateTime(row.orderDate)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => openDetail(row.id)}
                        >
                          View Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {ordersState.rows.map((row) => (
              <article key={row.id} className="card">
                <div className="card-head">
                  <h4>{row.orderNo || row.id}</h4>
                  <StatusBadge value={row.channel} label={humanize(row.channel)} />
                </div>
                <p className="muted">{row.customerName}</p>
                <p className="muted">{formatCurrencyInr(row.orderTotal)} / {formatDateTime(row.orderDate)}</p>
                <div className="status-stack">
                  <StatusBadge value={row.paymentStatus} />
                  <StatusBadge value={row.orderStatus} />
                  <StatusBadge value={row.shipmentStatus} />
                  <StatusBadge value={row.invoiceStatus} />
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => openDetail(row.id)}
                  >
                    View Detail
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Modal
        title={selectedOrder ? `Order Detail - ${selectedOrder.orderNo || selectedOrder.id}` : "Order Detail"}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width="960px"
      >
        {detailLoading ? (
          <LoadingBlock label="Loading order detail..." />
        ) : detailError ? (
          <ErrorBlock message={detailError} />
        ) : selectedOrder ? (
          <section className="stack">
            <div className="summary-grid">
              <article className="summary-card">
                <p>Grand Total</p>
                <h3>{formatCurrencyInr(selectedOrder.orderTotal)}</h3>
                <span>{selectedOrder.itemCount} item(s)</span>
              </article>
              <article className="summary-card">
                <p>Payment</p>
                <h3>{humanize(selectedOrder.paymentStatus)}</h3>
                <span>{humanize(selectedOrder.paymentMethod)}</span>
              </article>
              <article className="summary-card">
                <p>Order Status</p>
                <h3>{humanize(selectedOrder.orderStatus)}</h3>
                <span>{humanize(selectedOrder.shipmentStatus)}</span>
              </article>
              <article className="summary-card">
                <p>Invoice</p>
                <h3>{selectedOrder.invoice?.invoiceNumber || "Pending"}</h3>
                <span>{selectedOrder.invoice ? humanize(selectedOrder.invoiceStatus) : "Not generated yet"}</span>
              </article>
            </div>

            <div className="summary-grid">
              <article className="summary-card">
                <p>Customer</p>
                <h3>{selectedOrder.customerName}</h3>
                <span>{selectedOrder.customerEmail || selectedOrder.customerMobile || "No contact captured"}</span>
                {selectedOrder.customerMobile && (() => {
                  const waLink = buildWaLink(
                    selectedOrder.customerMobile,
                    `Hi ${selectedOrder.customerName}, your order #${selectedOrder.orderNo || selectedOrder.id} is ${humanize(selectedOrder.orderStatus)}. Total: ₹${selectedOrder.orderTotal}. Please let us know if you have any questions.`
                  );
                  return waLink ? (
                    <a href={waLink} target="_blank" rel="noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
                        fontSize: 11, fontWeight: 600, color: "#25d366",
                        textDecoration: "none", padding: "3px 8px",
                        border: "1px solid rgba(37,211,102,0.35)", borderRadius: 6,
                        background: "rgba(37,211,102,0.06)"
                      }}
                    >
                      <WaIcon /> WhatsApp Customer
                    </a>
                  ) : null;
                })()}
              </article>
              <article className="summary-card">
                <p>Channel</p>
                <h3>{humanize(selectedOrder.channel)}</h3>
                <span>{channelDescription(selectedOrder)}</span>
              </article>
              <article className="summary-card">
                <p>Created</p>
                <h3>{formatDateTime(selectedOrder.orderDate)}</h3>
                <span>{selectedOrder.customerType ? humanize(selectedOrder.customerType) : "Retail"}</span>
              </article>
              <article className="summary-card">
                <p>Tracking</p>
                <h3>{selectedOrder.trackingDetails?.trackingId || "Pending"}</h3>
                <span>{selectedOrder.trackingDetails?.courierName || "No courier assigned yet"}</span>
                {selectedOrder.customerMobile && selectedOrder.trackingDetails?.trackingId && (() => {
                  const waLink = buildWaLink(
                    selectedOrder.customerMobile,
                    `Hi ${selectedOrder.customerName}, your order #${selectedOrder.orderNo || selectedOrder.id} has been dispatched via ${selectedOrder.trackingDetails.courierName || "courier"}. Tracking ID: ${selectedOrder.trackingDetails.trackingId}. Track your shipment and let us know if you need help.`
                  );
                  return waLink ? (
                    <a href={waLink} target="_blank" rel="noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
                        fontSize: 11, fontWeight: 600, color: "#25d366",
                        textDecoration: "none", padding: "3px 8px",
                        border: "1px solid rgba(37,211,102,0.35)", borderRadius: 6,
                        background: "rgba(37,211,102,0.06)"
                      }}
                    >
                      <WaIcon /> Share Tracking
                    </a>
                  ) : null;
                })()}
              </article>
            </div>

            {selectedOrder.manualPaymentInstructions?.instructions ? (
              <section className="summary-card">
                <div className="section-head">
                  <div>
                    <h3 className="subsection-title">Manual Payment Instructions</h3>
                    <p className="muted">Shown because this order is awaiting manual payment completion.</p>
                  </div>
                </div>
                <div className="summary-grid">
                  {Object.entries(selectedOrder.manualPaymentInstructions.instructions)
                    .filter(([, value]) => Boolean(value))
                    .map(([key, value]) => (
                      <article key={key} className="summary-card">
                        <p>{humanize(key)}</p>
                        <h3>{String(value)}</h3>
                        <span>{selectedOrder.manualPaymentInstructions.gatewayLabel}</span>
                      </article>
                    ))}
                </div>
              </section>
            ) : null}

            <section className="summary-card">
              <div className="section-head">
                <div>
                  <h3 className="subsection-title">Pricing Summary</h3>
                  <p className="muted">GST-aware totals captured on the order snapshot.</p>
                </div>
              </div>
              <div className="summary-grid">
                <article className="summary-card"><p>Product Subtotal</p><h3>{formatCurrencyInr(selectedOrder.pricing.productSubtotal)}</h3></article>
                <article className="summary-card"><p>Discount</p><h3>{formatCurrencyInr(selectedOrder.pricing.discountAmount)}</h3></article>
                <article className="summary-card"><p>GST</p><h3>{formatCurrencyInr(selectedOrder.pricing.gstTotal)}</h3></article>
                <article className="summary-card"><p>Shipping</p><h3>{formatCurrencyInr(selectedOrder.pricing.shippingCharge)}</h3></article>
              </div>
            </section>

            <section className="summary-card">
              <div className="section-head">
                <div>
                  <h3 className="subsection-title">Items</h3>
                  <p className="muted">Line items frozen at order creation time.</p>
                </div>
              </div>
              <div className="mobile-cards" style={{ display: "flex" }}>
                {selectedOrder.items.map((item) => (
                  <article key={`${item.productId}-${item.sku}`} className="card">
                    <div className="card-head">
                      <h4>{item.title}</h4>
                      <strong>{formatCurrencyInr(item.lineTotal)}</strong>
                    </div>
                    <p className="muted">SKU: {item.sku || item.productId}</p>
                    <p className="muted">
                      Qty {item.qty} / Unit {formatCurrencyInr(item.unitPriceUsed)} / GST {item.gstRate}%
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="summary-card">
              <div className="section-head">
                <div>
                  <h3 className="subsection-title">Addresses and Tracking</h3>
                  <p className="muted">Billing, shipping, and latest shipment snapshots.</p>
                </div>
              </div>
              <div className="summary-grid">
                <article className="summary-card">
                  <p>Billing Address</p>
                  <span>{formatAddress(selectedOrder.billingAddress)}</span>
                </article>
                <article className="summary-card">
                  <p>Shipping Address</p>
                  <span>{formatAddress(selectedOrder.shippingAddress)}</span>
                </article>
                <article className="summary-card">
                  <p>Courier</p>
                  <span>{selectedOrder.trackingDetails?.courierName || "Not assigned"}</span>
                </article>
                <article className="summary-card">
                  <p>Tracking ID</p>
                  <span>{selectedOrder.trackingDetails?.trackingId || "Pending"}</span>
                </article>
              </div>
            </section>
          </section>
        ) : null}
      </Modal>
    </section>
  );
}
