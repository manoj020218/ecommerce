import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  updateB2BOrderStatus,
  updateCustomer
} from "./customers.api";

const BRAND = "#E8231A";

const CUSTOMER_TYPE_COLORS = {
  retail:        { bg: "#f3f4f6", text: "#6b7280" },
  dealer:        { bg: "#dbeafe", text: "#1d4ed8" },
  stockist:      { bg: "#f3e8ff", text: "#7c3aed" },
  distributor:   { bg: "#dcfce7", text: "#16a34a" },
  institutional: { bg: "#fef3c7", text: "#92400e" },
  project:       { bg: "#ffedd5", text: "#c2410c" }
};

function TypeBadge({ type }) {
  const c = CUSTOMER_TYPE_COLORS[type] || CUSTOMER_TYPE_COLORS.retail;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 20,
      textTransform: "capitalize", whiteSpace: "nowrap"
    }}>
      {type || "retail"}
    </span>
  );
}

function ApprovalBadge({ approved }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: approved ? "#dcfce7" : "#f3f4f6",
      color: approved ? "#16a34a" : "#6b7280",
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap"
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: approved ? "#22c55e" : "#9ca3af", flexShrink: 0 }} />
      {approved ? "B2B Approved" : "Not Approved"}
    </span>
  );
}

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
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canView = hasPermission(session, "customers.view");
  const canEdit = hasPermission(session, "customers.edit");
  const canMarkDealer = hasPermission(session, "customers.mark_dealer");
  const canManage = canEdit || canMarkDealer;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [orderRequests, setOrderRequests] = useState([]);
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
    const [customersData, orderRequestsData] = await Promise.all([
      fetchCustomers({ ...nextFilters, limit: 150 }),
      fetchB2BOrderRequests({ limit: 50 })
    ]);
    const customerItems = Array.isArray(customersData) ? customersData : customersData?.items || [];
    setCustomers(customerItems);
    setCustomerTotal(Number(customersData?.total ?? customerItems.length));
    setOrderRequests(Array.isArray(orderRequestsData) ? orderRequestsData : []);
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

      {/* ── stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Total Customers",    value: customerTotal,                                 bg: "#dbeafe", icon: "👥" },
          { label: "B2B Approved",       value: customers.filter((c) => c.isB2BApproved).length, bg: "#dcfce7", icon: "✅" },
          { label: "Pending B2B",        value: orderRequests.length,                           bg: "#fef3c7", icon: "📋" },
        ].map(({ label, value, bg, icon }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 14, border: "1px solid #f3f4f6", padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ width: 36, height: 36, background: bg, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 10 }}>{icon}</div>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0", fontWeight: 500 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── filter bar ── */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <form onSubmit={onFilterSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ flex: "1 1 240px", position: "relative" }}>
            <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#9ca3af", pointerEvents: "none" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="search"
              placeholder="Search name, email, mobile, GSTIN, company…"
              value={filters.q}
              onChange={(event) => setFilters((f) => ({ ...f, q: event.target.value }))}
              style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 10, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <select
            value={filters.customerType}
            onChange={(event) => setFilters((f) => ({ ...f, customerType: event.target.value }))}
            style={{ fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", background: "#fff", outline: "none", cursor: "pointer" }}
          >
            <option value="">All Types</option>
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
            style={{ fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", background: "#fff", outline: "none", cursor: "pointer" }}
          >
            <option value="">All Approval States</option>
            <option value="approved">B2B Approved</option>
            <option value="not_approved">Not Approved</option>
          </select>
          <button
            type="submit"
            style={{ fontSize: 13, fontWeight: 500, padding: "9px 16px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", cursor: "pointer", color: "#374151" }}
          >
            Apply
          </button>
        </form>
      </div>

      {notice ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 16px", fontSize: 13, color: "#15803d" }}>
          ✓ {notice}
        </div>
      ) : null}
      {error ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "10px 16px", fontSize: 13, color: "#dc2626" }}>
          {error}
        </div>
      ) : null}

      {/* ── desktop table ── */}
      <div className="desktop-only" style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
            <tr>
              {["Customer", "Type", "Approval", "Order Mode", "Orders", "Last Activity", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const displayName = customer.name || customer.companyName || customer.email || customer.id;
              const initials = displayName.slice(0, 2).toUpperCase();
              return (
                <tr
                  key={customer.id}
                  style={{ borderBottom: "1px solid #f9fafb" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                >
                  {/* customer */}
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                        background: customer.isB2BApproved ? BRAND : "#e5e7eb",
                        color: customer.isB2BApproved ? "#fff" : "#6b7280",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 700
                      }}>
                        {initials}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: "#111827", fontSize: 13 }}>{displayName}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>
                          {customer.email || "—"} · {customer.mobile || "—"}
                        </p>
                        {customer.companyName && customer.companyName !== displayName ? (
                          <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>{customer.companyName}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {/* type */}
                  <td style={{ padding: "14px 16px" }}>
                    <TypeBadge type={customer.customerType} />
                    {customer.priceGroup ? (
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9ca3af" }}>Group: {customer.priceGroup}</p>
                    ) : null}
                  </td>
                  {/* approval */}
                  <td style={{ padding: "14px 16px" }}>
                    <ApprovalBadge approved={customer.isB2BApproved} />
                    {customer.gstin ? (
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9ca3af" }}>GSTIN: {customer.gstin}</p>
                    ) : null}
                  </td>
                  {/* order mode */}
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>
                    {(customer.orderMode || "online").replace(/_/g, " ")}
                  </td>
                  {/* orders count */}
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      type="button"
                      onClick={() => openOrdersModal(customer)}
                      style={{ fontSize: 13, fontWeight: 600, color: BRAND, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      {customer.orderCount} orders
                    </button>
                  </td>
                  {/* last activity */}
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {formatDateTime(customer.lastLoginAt || customer.lastOrderAt || customer.createdAt)}
                  </td>
                  {/* actions */}
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => navigate(`/customers/${customer.id}`)}
                        style={{ fontSize: 12, color: BRAND, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                        View
                      </button>
                      <span style={{ color: "#e5e7eb" }}>|</span>
                      <button type="button" onClick={() => openOrdersModal(customer)}
                        style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                        Orders
                      </button>
                      {canManage ? (
                        <>
                          <span style={{ color: "#e5e7eb" }}>|</span>
                          <button type="button" onClick={() => openEditModal(customer)}
                            style={{ fontSize: 12, color: BRAND, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                            Edit
                          </button>
                        </>
                      ) : null}
                      {customer.mobile ? (
                        <>
                          <span style={{ color: "#e5e7eb" }}>|</span>
                          <WaBtn
                            phone={customer.mobile}
                            message={`Hi ${customer.name || customer.companyName || "there"}, this is a message from Jenix India.`}
                            label="WA"
                          />
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  No customers match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── mobile cards ── */}
      <div className="mobile-cards">
        {customers.map((customer) => {
          const displayName = customer.name || customer.companyName || customer.email || customer.id;
          const initials = displayName.slice(0, 2).toUpperCase();
          return (
            <div key={customer.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                  background: customer.isB2BApproved ? BRAND : "#e5e7eb",
                  color: customer.isB2BApproved ? "#fff" : "#6b7280",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 700
                }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "#111827", fontSize: 14 }}>{displayName}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>
                    {customer.email || "—"} · {customer.mobile || "—"}
                  </p>
                </div>
                <TypeBadge type={customer.customerType} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginBottom: 12, fontSize: 12 }}>
                <div style={{ color: "#9ca3af" }}>Approval: <span style={{ color: "#111827", fontWeight: 600 }}>{customer.isB2BApproved ? "B2B Approved" : "Not Approved"}</span></div>
                <div style={{ color: "#9ca3af" }}>Orders: <span style={{ color: "#111827", fontWeight: 600 }}>{customer.orderCount}</span></div>
                {customer.companyName ? <div style={{ color: "#9ca3af" }}>Company: <span style={{ color: "#111827", fontWeight: 600 }}>{customer.companyName}</span></div> : null}
                {customer.gstin ? <div style={{ color: "#9ca3af" }}>GSTIN: <span style={{ color: "#111827", fontWeight: 600 }}>{customer.gstin}</span></div> : null}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => navigate(`/customers/${customer.id}`)}
                  style={{ flex: 1, fontSize: 13, fontWeight: 600, color: BRAND, border: "1px solid rgba(232,35,26,0.3)", background: "rgba(232,35,26,0.04)", borderRadius: 8, padding: "7px 0", cursor: "pointer" }}>
                  View
                </button>
                <button type="button" onClick={() => openOrdersModal(customer)}
                  style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#6b7280", border: "1px solid #e5e7eb", background: "#fff", borderRadius: 8, padding: "7px 0", cursor: "pointer" }}>
                  Orders
                </button>
                {canManage ? (
                  <button type="button" onClick={() => openEditModal(customer)}
                    style={{ flex: 1, fontSize: 13, fontWeight: 600, color: BRAND, border: "1px solid rgba(232,35,26,0.3)", background: "rgba(232,35,26,0.04)", borderRadius: 8, padding: "7px 0", cursor: "pointer" }}>
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
            </div>
          );
        })}
      </div>

      {/* ── B2B Order Requests ── */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>B2B Order Requests</h3>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0" }}>Approve dealer requests and move paid pickup orders through fulfilment.</p>
          </div>
          {orderRequests.length > 0 && (
            <span style={{ fontSize: 12, background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>
              {orderRequests.length} pending
            </span>
          )}
        </div>
        {orderRequests.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {orderRequests.map((order) => (
              <div key={order.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #f3f4f6", padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: "#111827", fontSize: 14 }}>{order.orderNo}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>
                      {order.customerName}{order.companyName ? ` · ${order.companyName}` : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <StatusBadge value={order.orderStatus} />
                    <StatusBadge value={order.paymentStatus} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "4px 12px", marginBottom: 12, fontSize: 12 }}>
                  <div style={{ color: "#9ca3af" }}>Type: <span style={{ color: "#111827", fontWeight: 600 }}>{order.customerType}</span></div>
                  <div style={{ color: "#9ca3af" }}>Shipping: <span style={{ color: "#111827", fontWeight: 600 }}>{order.shippingMethod}</span></div>
                  <div style={{ color: "#9ca3af" }}>Total: <span style={{ color: BRAND, fontWeight: 700 }}>{formatCurrencyInr(order.grandTotal)}</span></div>
                  <div style={{ color: "#9ca3af" }}>Requested: <span style={{ color: "#111827", fontWeight: 600 }}>{formatDateTime(order.orderRequestReceivedAt || order.createdAt)}</span></div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
            ))}
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f3f4f6", padding: "14px 16px", fontSize: 13, color: "#9ca3af", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            No B2B order requests pending.
          </div>
        )}
      </div>

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
                      <tr
                        key={order.id}
                        onClick={() => navigate(`/orders/${order.id}`)}
                        style={{ cursor: "pointer" }}
                        title="View order details"
                      >
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
