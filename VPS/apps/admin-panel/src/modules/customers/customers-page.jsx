import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  approveB2BOrderRequest,
  fetchB2BOrderRequests,
  fetchCustomers,
  fetchManualPayments,
  updateB2BOrderStatus,
  updateCustomer,
  verifyManualPayment
} from "./customers.api";

const EMPTY_FORM = {
  customerType: "retail",
  priceGroup: "",
  isB2BApproved: false,
  gstin: "",
  companyName: "",
  creditAllowed: false,
  bankTransferOnly: false,
  pickupAllowed: false,
  orderMode: "online"
};

function buildForm(customer) {
  if (!customer) {
    return EMPTY_FORM;
  }

  return {
    customerType: customer.customerType || "retail",
    priceGroup: customer.priceGroup || "",
    isB2BApproved: Boolean(customer.isB2BApproved),
    gstin: customer.gstin || "",
    companyName: customer.companyName || "",
    creditAllowed: Boolean(customer.creditAllowed),
    bankTransferOnly: Boolean(customer.bankTransferOnly),
    pickupAllowed: Boolean(customer.pickupAllowed),
    orderMode: customer.orderMode || "online"
  };
}

export function CustomersPage() {
  const { session } = useAuthSession();
  const canView = hasPermission(session, "customers.view");
  const canEdit = hasPermission(session, "customers.edit");
  const canMarkDealer = hasPermission(session, "customers.mark_dealer");
  const canManage = canEdit || canMarkDealer;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customers, setCustomers] = useState([]);
  const [orderRequests, setOrderRequests] = useState([]);
  const [manualPayments, setManualPayments] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    customerType: "",
    approvalStatus: ""
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState("");

  const loadAll = async (nextFilters = filters) => {
    const [customersData, orderRequestsData, manualPaymentsData] = await Promise.all([
      fetchCustomers({ ...nextFilters, limit: 150 }),
      fetchB2BOrderRequests({ limit: 50 }),
      fetchManualPayments({ status: "pending_verification", limit: 50 })
    ]);

    setCustomers(Array.isArray(customersData) ? customersData : []);
    setOrderRequests(Array.isArray(orderRequestsData) ? orderRequestsData : []);
    setManualPayments(Array.isArray(manualPaymentsData) ? manualPaymentsData : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadAll();
    } catch (apiError) {
      setError(apiError.message || "Failed to load customers workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      bootstrap();
    }
  }, [canView]);

  const openEditModal = (customer) => {
    setSelectedCustomer(customer);
    setForm(buildForm(customer));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedCustomer(null);
    setForm(EMPTY_FORM);
    setSaving(false);
  };

  const onFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onFilterSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await loadAll(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to refresh customers.");
    }
  };

  const onSave = async (event) => {
    event.preventDefault();
    if (!selectedCustomer) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await updateCustomer(selectedCustomer.id, form);
      closeModal();
      await loadAll(filters);
      setNotice("Customer profile updated.");
    } catch (apiError) {
      setError(apiError.message || "Failed to update customer.");
    } finally {
      setSaving(false);
    }
  };

  const onApproveOrderRequest = async (orderId) => {
    setBusyKey(`approve:${orderId}`);
    setError("");
    setNotice("");

    try {
      await approveB2BOrderRequest(orderId, {
        paymentMethod: "direct_bank_transfer",
        approvalNote: "Approved for offline payment."
      });
      await loadAll(filters);
      setNotice("B2B order request approved.");
    } catch (apiError) {
      setError(apiError.message || "Failed to approve order request.");
    } finally {
      setBusyKey("");
    }
  };

  const onUpdateOrderStatus = async (orderId, orderStatus) => {
    setBusyKey(`${orderStatus}:${orderId}`);
    setError("");
    setNotice("");

    try {
      await updateB2BOrderStatus(orderId, {
        orderStatus,
        adminNote:
          orderStatus === "ready_for_pickup"
            ? "Pickup counter is ready."
            : orderStatus === "picked_up"
              ? "Customer collected the order."
              : ""
      });
      await loadAll(filters);
      setNotice(`Order updated: ${orderStatus.replace(/_/g, " ")}`);
    } catch (apiError) {
      setError(apiError.message || "Failed to update order status.");
    } finally {
      setBusyKey("");
    }
  };

  const onVerifyManualPayment = async (submissionId) => {
    setBusyKey(`verify:${submissionId}`);
    setError("");
    setNotice("");

    try {
      await verifyManualPayment(submissionId, {
        action: "approve",
        verificationNote: "Payment matched with bank proof."
      });
      await loadAll(filters);
      setNotice("Manual payment verified.");
    } catch (apiError) {
      setError(apiError.message || "Failed to verify manual payment.");
    } finally {
      setBusyKey("");
    }
  };

  const onRejectManualPayment = async (submissionId) => {
    const rejectionReason = window.prompt(
      "Enter rejection reason for this payment proof:",
      "proof_not_clear"
    );
    if (!rejectionReason) {
      return;
    }

    setBusyKey(`reject:${submissionId}`);
    setError("");
    setNotice("");

    try {
      await verifyManualPayment(submissionId, {
        action: "reject",
        rejectionReason,
        verificationNote: rejectionReason
      });
      await loadAll(filters);
      setNotice("Manual payment rejected.");
    } catch (apiError) {
      setError(apiError.message || "Failed to reject manual payment.");
    } finally {
      setBusyKey("");
    }
  };

  if (!canView) {
    return <ErrorBlock message="You do not have permission to view customers." />;
  }

  if (loading) {
    return <LoadingBlock label="Loading customers..." />;
  }

  if (error && customers.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Customers"
        description="Manage dealer approvals, B2B order requests, and manual bank-payment verification."
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search"
          placeholder="Search by name, email, mobile, GSTIN, or company"
          value={filters.q}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              q: event.target.value
            }))
          }
        />
        <select
          value={filters.customerType}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              customerType: event.target.value
            }))
          }
        >
          <option value="">All customer types</option>
          <option value="retail">Retail</option>
          <option value="dealer">Dealer</option>
          <option value="stockist">Stockist</option>
          <option value="distributor">Distributor</option>
          <option value="institutional">Institutional</option>
          <option value="project">Project</option>
        </select>
        <select
          value={filters.approvalStatus}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              approvalStatus: event.target.value
            }))
          }
        >
          <option value="">All approval states</option>
          <option value="approved">Approved B2B</option>
          <option value="not_approved">Not Approved</option>
        </select>
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
              <th>Customer</th>
              <th>Type</th>
              <th>Approval</th>
              <th>Order Mode</th>
              <th>Orders</th>
              <th>Last Activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <strong>{customer.name || customer.companyName || customer.email || customer.id}</strong>
                  <p className="row-sub">
                    {customer.companyName || "No company"} | {customer.email || "No email"} | {customer.mobile || "No mobile"}
                  </p>
                </td>
                <td>
                  <StatusBadge value={customer.customerType} />
                  {customer.priceGroup ? <p className="row-sub">Price group: {customer.priceGroup}</p> : null}
                </td>
                <td>
                  <StatusBadge value={customer.isB2BApproved ? "active" : "inactive"} label={customer.isB2BApproved ? "Approved" : "Not Approved"} />
                  {customer.gstin ? <p className="row-sub">GSTIN: {customer.gstin}</p> : null}
                </td>
                <td>{customer.orderMode}</td>
                <td>{customer.orderCount}</td>
                <td>{formatDateTime(customer.lastLoginAt || customer.lastOrderAt || customer.createdAt)}</td>
                <td>
                  {canManage ? (
                    <button type="button" className="btn btn-secondary" onClick={() => openEditModal(customer)}>
                      Edit
                    </button>
                  ) : (
                    <span className="row-sub">View only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-list">
        {customers.map((customer) => (
          <article key={customer.id} className="panel-card">
            <div className="panel-card-head">
              <div>
                <strong>{customer.name || customer.companyName || customer.email || customer.id}</strong>
                <p className="row-sub">{customer.companyName || "No company"}</p>
              </div>
              <StatusBadge value={customer.customerType} />
            </div>
            <div className="detail-grid">
              <div><span>Email</span><strong>{customer.email || "--"}</strong></div>
              <div><span>Mobile</span><strong>{customer.mobile || "--"}</strong></div>
              <div><span>Approval</span><strong>{customer.isB2BApproved ? "Approved" : "Not Approved"}</strong></div>
              <div><span>Order Mode</span><strong>{customer.orderMode}</strong></div>
            </div>
            {canManage ? (
              <button type="button" className="btn btn-secondary" onClick={() => openEditModal(customer)}>
                Edit Customer
              </button>
            ) : null}
          </article>
        ))}
      </div>

      <section className="section-card">
        <div className="section-head">
          <h3>B2B Order Requests</h3>
          <p>Approve dealer requests and move paid pickup orders through fulfilment.</p>
        </div>
        <div className="card-list">
          {orderRequests.length ? orderRequests.map((order) => (
            <div key={order.id} className="list-card">
              <div className="list-card-head">
                <div>
                  <strong>{order.orderNo}</strong>
                  <p>{order.customerName} {order.companyName ? `| ${order.companyName}` : ""}</p>
                </div>
                <div className="list-card-meta">
                  <StatusBadge value={order.orderStatus} />
                  <StatusBadge value={order.paymentStatus} />
                </div>
              </div>
              <div className="detail-pairs compact">
                <div><span>Customer Type</span><strong>{order.customerType}</strong></div>
                <div><span>Shipping</span><strong>{order.shippingMethod}</strong></div>
                <div><span>Total</span><strong>{formatCurrencyInr(order.grandTotal)}</strong></div>
                <div><span>Requested</span><strong>{formatDateTime(order.orderRequestReceivedAt || order.createdAt)}</strong></div>
              </div>
              <div className="action-row">
                {canManage && order.orderStatus === "awaiting_admin_approval" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onApproveOrderRequest(order.id)}
                    disabled={busyKey === `approve:${order.id}`}
                  >
                    {busyKey === `approve:${order.id}` ? "Approving..." : "Approve Request"}
                  </button>
                ) : null}
                {canManage && order.paymentStatus === "paid" && order.orderStatus !== "ready_for_pickup" && order.shippingMethod === "self_pickup" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onUpdateOrderStatus(order.id, "ready_for_pickup")}
                    disabled={busyKey === `ready_for_pickup:${order.id}`}
                  >
                    {busyKey === `ready_for_pickup:${order.id}` ? "Updating..." : "Ready For Pickup"}
                  </button>
                ) : null}
                {canManage && order.orderStatus === "ready_for_pickup" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onUpdateOrderStatus(order.id, "picked_up")}
                    disabled={busyKey === `picked_up:${order.id}`}
                  >
                    {busyKey === `picked_up:${order.id}` ? "Updating..." : "Mark Picked Up"}
                  </button>
                ) : null}
                {canManage && order.paymentStatus === "paid" && order.shippingMethod !== "self_pickup" && order.orderStatus !== "dispatched" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onUpdateOrderStatus(order.id, "dispatched")}
                    disabled={busyKey === `dispatched:${order.id}`}
                  >
                    {busyKey === `dispatched:${order.id}` ? "Updating..." : "Mark Dispatched"}
                  </button>
                ) : null}
                {canManage && order.orderStatus === "dispatched" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onUpdateOrderStatus(order.id, "delivered")}
                    disabled={busyKey === `delivered:${order.id}`}
                  >
                    {busyKey === `delivered:${order.id}` ? "Updating..." : "Mark Delivered"}
                  </button>
                ) : null}
              </div>
            </div>
          )) : <div className="empty-panel">No B2B order requests yet.</div>}
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <h3>Pending Manual Payments</h3>
          <p>Verify bank transfer or UPI proofs so invoices can be generated.</p>
        </div>
        <div className="card-list">
          {manualPayments.length ? manualPayments.map((submission) => (
            <div key={submission.id} className="list-card">
              <div className="list-card-head">
                <div>
                  <strong>{submission.order?.orderNo || submission.orderNo}</strong>
                  <p>{submission.paymentMethod} | UTR {submission.utrNumber}</p>
                </div>
                <StatusBadge value={submission.status} />
              </div>
              <div className="detail-pairs compact">
                <div><span>Total</span><strong>{formatCurrencyInr(submission.order?.grandTotal || 0)}</strong></div>
                <div><span>Submitted</span><strong>{formatDateTime(submission.submittedAt)}</strong></div>
                <div><span>Order Status</span><strong>{submission.order?.orderStatus || "--"}</strong></div>
                <div><span>Proof</span><strong>{submission.screenshotUrl ? "Uploaded" : "Missing"}</strong></div>
              </div>
              <div className="action-row">
                {submission.screenshotUrl ? (
                  <a className="btn btn-secondary" href={submission.screenshotUrl} target="_blank" rel="noreferrer">
                    Open Proof
                  </a>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onVerifyManualPayment(submission.id)}
                    disabled={busyKey === `verify:${submission.id}`}
                  >
                    {busyKey === `verify:${submission.id}` ? "Verifying..." : "Verify Payment"}
                  </button>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onRejectManualPayment(submission.id)}
                    disabled={busyKey === `reject:${submission.id}`}
                  >
                    {busyKey === `reject:${submission.id}` ? "Rejecting..." : "Reject"}
                  </button>
                ) : null}
              </div>
            </div>
          )) : <div className="empty-panel">No pending manual payment proofs.</div>}
        </div>
      </section>

      <Modal
        open={modalOpen}
        title={selectedCustomer ? `Edit ${selectedCustomer.name || selectedCustomer.email}` : "Edit Customer"}
        onClose={closeModal}
      >
        <form className="stack-form" onSubmit={onSave}>
          <div className="field-grid">
            <label>
              <span>Customer Type</span>
              <select name="customerType" value={form.customerType} onChange={onFormChange}>
                <option value="retail">Retail</option>
                <option value="dealer">Dealer</option>
                <option value="stockist">Stockist</option>
                <option value="distributor">Distributor</option>
                <option value="institutional">Institutional</option>
                <option value="project">Project</option>
              </select>
            </label>
            <label>
              <span>Price Group</span>
              <input name="priceGroup" value={form.priceGroup} onChange={onFormChange} placeholder="dealer / stockist / project-a" />
            </label>
            <label>
              <span>GSTIN</span>
              <input name="gstin" value={form.gstin} onChange={onFormChange} />
            </label>
            <label>
              <span>Company Name</span>
              <input name="companyName" value={form.companyName} onChange={onFormChange} />
            </label>
            <label>
              <span>Order Mode</span>
              <select name="orderMode" value={form.orderMode} onChange={onFormChange}>
                <option value="online">Online</option>
                <option value="offline_request">Offline Request</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
          </div>
          <div className="check-row">
            <label className="inline-check"><input type="checkbox" name="isB2BApproved" checked={form.isB2BApproved} onChange={onFormChange} /><span>Approve B2B pricing</span></label>
            <label className="inline-check"><input type="checkbox" name="creditAllowed" checked={form.creditAllowed} onChange={onFormChange} /><span>Credit Allowed</span></label>
            <label className="inline-check"><input type="checkbox" name="bankTransferOnly" checked={form.bankTransferOnly} onChange={onFormChange} /><span>Bank Transfer Only</span></label>
            <label className="inline-check"><input type="checkbox" name="pickupAllowed" checked={form.pickupAllowed} onChange={onFormChange} /><span>Self Pickup Allowed</span></label>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Customer"}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
