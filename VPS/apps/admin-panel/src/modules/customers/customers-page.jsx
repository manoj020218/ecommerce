import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";

function WaBtn({ phone, message, label = "WhatsApp" }) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 11, fontWeight: 600, color: "#25d366",
        textDecoration: "none", padding: "2px 7px",
        border: "1px solid rgba(37,211,102,0.35)", borderRadius: 5,
        background: "rgba(37,211,102,0.06)", whiteSpace: "nowrap"
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 00-8.7 15l-1.2 5 5.1-1.3A10 10 0 1012 2zm5.1 13.4c-.2.6-1.2 1.2-1.7 1.3-.5.1-1.1.2-3.1-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3 1 1.7 2.4 2.7 1.8 1.3 3.3 1.7 3.7 1.9.4.2.7.1.9-.1.3-.3 1-.9 1.2-1.2.2-.3.4-.3.7-.2l1.8.9c.3.2.5.3.6.5.1.2.1.9-.1 1.4z" />
      </svg>
      {label}
    </a>
  );
}
import {
  approveB2BOrderRequest,
  createCustomer,
  fetchB2BOrderRequests,
  fetchCustomerOrders,
  fetchCustomers,
  fetchManualPayments,
  updateB2BOrderStatus,
  updateCustomer,
  verifyManualPayment
} from "./customers.api";

const EMPTY_EDIT_FORM = {
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

const EMPTY_CREATE_FORM = {
  name: "",
  email: "",
  mobile: "",
  password: "",
  customerType: "retail",
  companyName: "",
  gstin: "",
  priceGroup: "",
  isB2BApproved: false,
  creditAllowed: false,
  bankTransferOnly: false,
  pickupAllowed: false,
  orderMode: "online"
};

function buildEditForm(customer) {
  if (!customer) return EMPTY_EDIT_FORM;
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
  const [filters, setFilters] = useState({ q: "", customerType: "", approvalStatus: "" });
  const [busyKey, setBusyKey] = useState("");

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createSaving, setCreateSaving] = useState(false);

  // Orders drawer
  const [ordersCustomer, setOrdersCustomer] = useState(null);
  const [ordersData, setOrdersData] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);

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
    if (canView) bootstrap();
  }, [canView]);

  // --- Edit handlers ---
  const openEditModal = (customer) => {
    setSelectedCustomer(customer);
    setEditForm(buildEditForm(customer));
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedCustomer(null);
    setEditForm(EMPTY_EDIT_FORM);
    setEditSaving(false);
  };

  const onEditFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setEditForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const onSaveEdit = async (event) => {
    event.preventDefault();
    if (!selectedCustomer) return;
    setEditSaving(true);
    setError("");
    setNotice("");
    try {
      await updateCustomer(selectedCustomer.id, editForm);
      closeEditModal();
      await loadAll(filters);
      setNotice("Customer profile updated.");
    } catch (apiError) {
      setError(apiError.message || "Failed to update customer.");
    } finally {
      setEditSaving(false);
    }
  };

  // --- Create handlers ---
  const openCreateModal = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateSaving(false);
  };

  const onCreateFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setCreateForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const onSaveCreate = async (event) => {
    event.preventDefault();
    setCreateSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = { ...createForm };
      if (!payload.password) delete payload.password;
      await createCustomer(payload);
      closeCreateModal();
      await loadAll(filters);
      setNotice(`Customer "${createForm.name}" created.`);
    } catch (apiError) {
      setError(apiError.message || "Failed to create customer.");
    } finally {
      setCreateSaving(false);
    }
  };

  // --- Orders handlers ---
  const openOrdersModal = async (customer) => {
    setOrdersCustomer(customer);
    setOrdersModalOpen(true);
    setOrdersLoading(true);
    setOrdersData(null);
    try {
      const data = await fetchCustomerOrders(customer.id);
      setOrdersData(data);
    } catch (apiError) {
      setError(apiError.message || "Failed to load customer orders.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const closeOrdersModal = () => {
    setOrdersModalOpen(false);
    setOrdersCustomer(null);
    setOrdersData(null);
  };

  // --- B2B / Manual Payment handlers ---
  const onFilterSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await loadAll(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to refresh customers.");
    }
  };

  const onApproveOrderRequest = async (orderId) => {
    setBusyKey(`approve:${orderId}`);
    setError("");
    setNotice("");
    try {
      await approveB2BOrderRequest(orderId, { paymentMethod: "direct_bank_transfer", approvalNote: "Approved for offline payment." });
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
      await updateB2BOrderStatus(orderId, { orderStatus, adminNote: "" });
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
      await verifyManualPayment(submissionId, { action: "approve", verificationNote: "Payment matched with bank proof." });
      await loadAll(filters);
      setNotice("Manual payment verified.");
    } catch (apiError) {
      setError(apiError.message || "Failed to verify manual payment.");
    } finally {
      setBusyKey("");
    }
  };

  const onRejectManualPayment = async (submissionId) => {
    const rejectionReason = window.prompt("Enter rejection reason for this payment proof:", "proof_not_clear");
    if (!rejectionReason) return;
    setBusyKey(`reject:${submissionId}`);
    setError("");
    setNotice("");
    try {
      await verifyManualPayment(submissionId, { action: "reject", rejectionReason, verificationNote: rejectionReason });
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
        actions={
          canManage ? (
            <button type="button" className="btn btn-primary" onClick={openCreateModal}>
              Add Customer
            </button>
          ) : null
        }
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search"
          placeholder="Search by name, email, mobile, GSTIN, or company"
          value={filters.q}
          onChange={(event) => setFilters((f) => ({ ...f, q: event.target.value }))}
        />
        <select
          value={filters.customerType}
          onChange={(event) => setFilters((f) => ({ ...f, customerType: event.target.value }))}
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
          onChange={(event) => setFilters((f) => ({ ...f, approvalStatus: event.target.value }))}
        >
          <option value="">All approval states</option>
          <option value="approved">Approved B2B</option>
          <option value="not_approved">Not Approved</option>
        </select>
        <button type="submit" className="btn btn-secondary">Apply</button>
      </form>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {/* Desktop table */}
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
                  <StatusBadge
                    value={customer.isB2BApproved ? "active" : "inactive"}
                    label={customer.isB2BApproved ? "Approved" : "Not Approved"}
                  />
                  {customer.gstin ? <p className="row-sub">GSTIN: {customer.gstin}</p> : null}
                </td>
                <td>{customer.orderMode}</td>
                <td>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => openOrdersModal(customer)}
                    title="View orders"
                  >
                    {customer.orderCount} orders
                  </button>
                </td>
                <td>{formatDateTime(customer.lastLoginAt || customer.lastOrderAt || customer.createdAt)}</td>
                <td className="row-actions">
                  <button type="button" className="btn-link" onClick={() => openOrdersModal(customer)}>
                    Orders
                  </button>
                  {canManage ? (
                    <button type="button" className="btn-link" onClick={() => openEditModal(customer)}>
                      Edit
                    </button>
                  ) : null}
                  {customer.mobile ? (
                    <WaBtn
                      phone={customer.mobile}
                      message={`Hi ${customer.name || customer.companyName || "there"}, this is a message from Jenix India.`}
                      label="WA"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
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
              <div><span>Orders</span><strong>{customer.orderCount}</strong></div>
            </div>
            <div className="card-actions">
              <button type="button" className="btn btn-secondary" onClick={() => openOrdersModal(customer)}>
                Orders
              </button>
              {canManage ? (
                <button type="button" className="btn btn-secondary" onClick={() => openEditModal(customer)}>
                  Edit
                </button>
              ) : null}
              {customer.mobile ? (
                <WaBtn
                  phone={customer.mobile}
                  message={`Hi ${customer.name || customer.companyName || "there"}, this is a message from Jenix India.`}
                  label="WhatsApp"
                />
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {/* B2B Order Requests */}
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
                  <p>{order.customerName}{order.companyName ? ` | ${order.companyName}` : ""}</p>
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
                  <button type="button" className="btn btn-primary" onClick={() => onApproveOrderRequest(order.id)} disabled={busyKey === `approve:${order.id}`}>
                    {busyKey === `approve:${order.id}` ? "Approving..." : "Approve Request"}
                  </button>
                ) : null}
                {canManage && order.paymentStatus === "paid" && order.orderStatus !== "ready_for_pickup" && order.shippingMethod === "self_pickup" ? (
                  <button type="button" className="btn btn-secondary" onClick={() => onUpdateOrderStatus(order.id, "ready_for_pickup")} disabled={busyKey === `ready_for_pickup:${order.id}`}>
                    {busyKey === `ready_for_pickup:${order.id}` ? "Updating..." : "Ready For Pickup"}
                  </button>
                ) : null}
                {canManage && order.orderStatus === "ready_for_pickup" ? (
                  <button type="button" className="btn btn-secondary" onClick={() => onUpdateOrderStatus(order.id, "picked_up")} disabled={busyKey === `picked_up:${order.id}`}>
                    {busyKey === `picked_up:${order.id}` ? "Updating..." : "Mark Picked Up"}
                  </button>
                ) : null}
                {canManage && order.paymentStatus === "paid" && order.shippingMethod !== "self_pickup" && order.orderStatus !== "dispatched" ? (
                  <button type="button" className="btn btn-secondary" onClick={() => onUpdateOrderStatus(order.id, "dispatched")} disabled={busyKey === `dispatched:${order.id}`}>
                    {busyKey === `dispatched:${order.id}` ? "Updating..." : "Mark Dispatched"}
                  </button>
                ) : null}
                {canManage && order.orderStatus === "dispatched" ? (
                  <button type="button" className="btn btn-secondary" onClick={() => onUpdateOrderStatus(order.id, "delivered")} disabled={busyKey === `delivered:${order.id}`}>
                    {busyKey === `delivered:${order.id}` ? "Updating..." : "Mark Delivered"}
                  </button>
                ) : null}
              </div>
            </div>
          )) : <div className="empty-panel">No B2B order requests yet.</div>}
        </div>
      </section>

      {/* Manual Payments */}
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
                  <a className="btn btn-secondary" href={submission.screenshotUrl} target="_blank" rel="noreferrer">Open Proof</a>
                ) : null}
                {canManage ? (
                  <button type="button" className="btn btn-primary" onClick={() => onVerifyManualPayment(submission.id)} disabled={busyKey === `verify:${submission.id}`}>
                    {busyKey === `verify:${submission.id}` ? "Verifying..." : "Verify Payment"}
                  </button>
                ) : null}
                {canManage ? (
                  <button type="button" className="btn btn-secondary" onClick={() => onRejectManualPayment(submission.id)} disabled={busyKey === `reject:${submission.id}`}>
                    {busyKey === `reject:${submission.id}` ? "Rejecting..." : "Reject"}
                  </button>
                ) : null}
              </div>
            </div>
          )) : <div className="empty-panel">No pending manual payment proofs.</div>}
        </div>
      </section>

      {/* ---- Create Customer Modal ---- */}
      <Modal
        open={createModalOpen}
        title="Add Customer"
        onClose={closeCreateModal}
      >
        <form className="form-grid" onSubmit={onSaveCreate}>
          <label className="field">
            <span>Full Name *</span>
            <input name="name" value={createForm.name} onChange={onCreateFormChange} required />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" name="email" value={createForm.email} onChange={onCreateFormChange} />
          </label>
          <label className="field">
            <span>Mobile</span>
            <input name="mobile" value={createForm.mobile} onChange={onCreateFormChange} placeholder="+91..." />
          </label>
          <label className="field">
            <span>Initial Password</span>
            <input type="password" name="password" value={createForm.password} onChange={onCreateFormChange} placeholder="min 6 characters" />
          </label>
          <label className="field">
            <span>Customer Type</span>
            <select name="customerType" value={createForm.customerType} onChange={onCreateFormChange}>
              <option value="retail">Retail</option>
              <option value="dealer">Dealer</option>
              <option value="stockist">Stockist</option>
              <option value="distributor">Distributor</option>
              <option value="institutional">Institutional</option>
              <option value="project">Project</option>
            </select>
          </label>
          <label className="field">
            <span>Price Group</span>
            <input name="priceGroup" value={createForm.priceGroup} onChange={onCreateFormChange} placeholder="dealer / stockist / project-a" />
          </label>
          <label className="field field-full">
            <span>Company Name</span>
            <input name="companyName" value={createForm.companyName} onChange={onCreateFormChange} />
          </label>
          <label className="field">
            <span>GSTIN</span>
            <input name="gstin" value={createForm.gstin} onChange={onCreateFormChange} placeholder="22AAAAA0000A1Z5" />
          </label>
          <label className="field">
            <span>Order Mode</span>
            <select name="orderMode" value={createForm.orderMode} onChange={onCreateFormChange}>
              <option value="online">Online</option>
              <option value="offline_request">Offline Request</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <div className="field-full check-row">
            <label className="inline-check">
              <input type="checkbox" name="isB2BApproved" checked={createForm.isB2BApproved} onChange={onCreateFormChange} />
              <span>Approve B2B pricing</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="creditAllowed" checked={createForm.creditAllowed} onChange={onCreateFormChange} />
              <span>Credit Allowed</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="bankTransferOnly" checked={createForm.bankTransferOnly} onChange={onCreateFormChange} />
              <span>Bank Transfer Only</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="pickupAllowed" checked={createForm.pickupAllowed} onChange={onCreateFormChange} />
              <span>Self Pickup Allowed</span>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeCreateModal}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={createSaving}>
              {createSaving ? "Creating..." : "Create Customer"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Edit Customer Modal ---- */}
      <Modal
        open={editModalOpen}
        title={selectedCustomer ? `Edit ${selectedCustomer.name || selectedCustomer.email}` : "Edit Customer"}
        onClose={closeEditModal}
      >
        <form className="form-grid" onSubmit={onSaveEdit}>
          <label className="field">
            <span>Customer Type</span>
            <select name="customerType" value={editForm.customerType} onChange={onEditFormChange}>
              <option value="retail">Retail</option>
              <option value="dealer">Dealer</option>
              <option value="stockist">Stockist</option>
              <option value="distributor">Distributor</option>
              <option value="institutional">Institutional</option>
              <option value="project">Project</option>
            </select>
          </label>
          <label className="field">
            <span>Price Group</span>
            <input name="priceGroup" value={editForm.priceGroup} onChange={onEditFormChange} placeholder="dealer / stockist / project-a" />
          </label>
          <label className="field">
            <span>GSTIN</span>
            <input name="gstin" value={editForm.gstin} onChange={onEditFormChange} />
          </label>
          <label className="field">
            <span>Company Name</span>
            <input name="companyName" value={editForm.companyName} onChange={onEditFormChange} />
          </label>
          <label className="field">
            <span>Order Mode</span>
            <select name="orderMode" value={editForm.orderMode} onChange={onEditFormChange}>
              <option value="online">Online</option>
              <option value="offline_request">Offline Request</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <div className="field-full check-row">
            <label className="inline-check">
              <input type="checkbox" name="isB2BApproved" checked={editForm.isB2BApproved} onChange={onEditFormChange} />
              <span>Approve B2B pricing</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="creditAllowed" checked={editForm.creditAllowed} onChange={onEditFormChange} />
              <span>Credit Allowed</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="bankTransferOnly" checked={editForm.bankTransferOnly} onChange={onEditFormChange} />
              <span>Bank Transfer Only</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="pickupAllowed" checked={editForm.pickupAllowed} onChange={onEditFormChange} />
              <span>Self Pickup Allowed</span>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeEditModal}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={editSaving}>
              {editSaving ? "Saving..." : "Save Customer"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Orders Modal ---- */}
      <Modal
        open={ordersModalOpen}
        title={ordersCustomer ? `Orders — ${ordersCustomer.name || ordersCustomer.email}` : "Customer Orders"}
        onClose={closeOrdersModal}
      >
        {ordersLoading ? (
          <LoadingBlock label="Loading orders..." />
        ) : ordersData ? (
          <div className="stack">
            {ordersData.orders.length === 0 ? (
              <div className="empty-panel">This customer has no orders yet.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th>Total</th>
                      <th>Shipment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersData.orders.map((order) => (
                      <tr key={order.id}>
                        <td><strong>{order.orderNo}</strong></td>
                        <td>{formatDateTime(order.createdAt)}</td>
                        <td><StatusBadge value={order.orderStatus} /></td>
                        <td><StatusBadge value={order.paymentStatus} /></td>
                        <td>{formatCurrencyInr(order.grandTotal)}</td>
                        <td><StatusBadge value={order.shipmentStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
