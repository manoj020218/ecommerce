import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchAbandonedCartRecoveries } from "../abandoned-carts/abandoned-carts.api";
import {
  fetchCustomer,
  fetchCustomerOrders,
  fetchCustomerCart,
  fetchCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  updateCustomer
} from "./customers.api";

const BRAND = "#E8231A";

const EMPTY_ADDRESS_FORM = {
  label: "",
  name: "",
  mobile: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  stateCode: "",
  pincode: "",
  country: "India",
  isDefaultBilling: false,
  isDefaultShipping: false
};

function AddressCard({ address, canManage, onEdit, onDelete }) {
  return (
    <div style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 14, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#111827" }}>
            {address.label || "Address"}
            {address.isDefaultBilling ? (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: BRAND, background: "rgba(232,35,26,0.08)", padding: "2px 6px", borderRadius: 10 }}>Default Billing</span>
            ) : null}
            {address.isDefaultShipping ? (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: "#1d4ed8", background: "#dbeafe", padding: "2px 6px", borderRadius: 10 }}>Default Shipping</span>
            ) : null}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>{address.name}</p>
        </div>
        {canManage ? (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={() => onEdit(address)}
              style={{ fontSize: 11, fontWeight: 600, color: BRAND, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Edit
            </button>
            <button type="button" onClick={() => onDelete(address.id)}
              style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Remove
            </button>
          </div>
        ) : null}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
        {address.addressLine1}
        {address.addressLine2 ? `, ${address.addressLine2}` : ""}
        <br />
        {address.city}, {address.state} {address.pincode}
        <br />
        {address.country}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9ca3af" }}>
        {address.mobile || "—"} {address.email ? `· ${address.email}` : ""}
      </p>
    </div>
  );
}

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canManage = hasPermission(session, "customers.edit") || hasPermission(session, "customers.mark_dealer");
  const canViewMarketing = hasPermission(session, "marketing.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);

  const [cart, setCart] = useState(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState("");

  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressesError, setAddressesError] = useState("");

  const [abandoned, setAbandoned] = useState([]);
  const [abandonedLoading, setAbandonedLoading] = useState(true);
  const [abandonedError, setAbandonedError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressFormError, setAddressFormError] = useState("");

  const [blockBusy, setBlockBusy] = useState(false);

  async function loadCore() {
    setLoading(true);
    setError("");
    try {
      const [customerData, ordersData] = await Promise.all([
        fetchCustomer(customerId),
        fetchCustomerOrders(customerId)
      ]);
      setCustomer(customerData);
      setOrders(ordersData.orders || []);
    } catch (err) {
      setError(err.message || "Failed to load customer.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCart() {
    setCartLoading(true);
    setCartError("");
    try {
      setCart(await fetchCustomerCart(customerId));
    } catch (err) {
      setCartError(err.message || "Failed to load cart.");
    } finally {
      setCartLoading(false);
    }
  }

  async function loadAddresses() {
    setAddressesLoading(true);
    setAddressesError("");
    try {
      setAddresses((await fetchCustomerAddresses(customerId)) || []);
    } catch (err) {
      setAddressesError(err.message || "Failed to load addresses.");
    } finally {
      setAddressesLoading(false);
    }
  }

  async function loadAbandoned() {
    if (!canViewMarketing) {
      setAbandonedLoading(false);
      return;
    }
    setAbandonedLoading(true);
    setAbandonedError("");
    try {
      setAbandoned((await fetchAbandonedCartRecoveries({ customerId, limit: 20 })) || []);
    } catch (err) {
      setAbandonedError(err.message || "Failed to load abandoned cart history.");
    } finally {
      setAbandonedLoading(false);
    }
  }

  useEffect(() => {
    loadCore();
    loadCart();
    loadAddresses();
    loadAbandoned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  function openEditModal() {
    setEditForm({
      name: customer.name || "",
      email: customer.email || "",
      mobile: customer.mobile || "",
      customerType: customer.customerType || "retail",
      priceGroup: customer.priceGroup || "",
      gstin: customer.gstin || "",
      companyName: customer.companyName || "",
      isB2BApproved: Boolean(customer.isB2BApproved),
      creditAllowed: Boolean(customer.creditAllowed),
      bankTransferOnly: Boolean(customer.bankTransferOnly),
      pickupAllowed: Boolean(customer.pickupAllowed),
      orderMode: customer.orderMode || "online",
      newsletterSubscribed: Boolean(customer.newsletterSubscribed)
    });
    setEditError("");
    setEditOpen(true);
  }

  function onEditFormChange(event) {
    const { name, type, checked, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function onSaveEdit(event) {
    event.preventDefault();
    setEditSaving(true);
    setEditError("");
    try {
      const updated = await updateCustomer(customerId, editForm);
      setCustomer((current) => ({ ...current, ...updated }));
      setEditOpen(false);
    } catch (err) {
      setEditError(err.message || "Failed to update customer.");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleBlockStatus() {
    const nextStatus = customer.accountStatus === "blocked" ? "active" : "blocked";
    const verb = nextStatus === "blocked" ? "block" : "unblock";
    if (!window.confirm(`Are you sure you want to ${verb} this customer?`)) {
      return;
    }
    setBlockBusy(true);
    try {
      const updated = await updateCustomer(customerId, { accountStatus: nextStatus });
      setCustomer((current) => ({ ...current, ...updated }));
    } catch (err) {
      window.alert(err.message || `Failed to ${verb} customer.`);
    } finally {
      setBlockBusy(false);
    }
  }

  function openCreateAddressModal() {
    setEditingAddressId(null);
    setAddressForm(EMPTY_ADDRESS_FORM);
    setAddressFormError("");
    setAddressModalOpen(true);
  }

  function openEditAddressModal(address) {
    setEditingAddressId(address.id);
    setAddressForm({
      label: address.label || "",
      name: address.name || "",
      mobile: address.mobile || "",
      email: address.email || "",
      addressLine1: address.addressLine1 || "",
      addressLine2: address.addressLine2 || "",
      city: address.city || "",
      state: address.state || "",
      stateCode: address.stateCode || "",
      pincode: address.pincode || "",
      country: address.country || "India",
      isDefaultBilling: Boolean(address.isDefaultBilling),
      isDefaultShipping: Boolean(address.isDefaultShipping)
    });
    setAddressFormError("");
    setAddressModalOpen(true);
  }

  function onAddressFormChange(event) {
    const { name, type, checked, value } = event.target;
    setAddressForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function onSaveAddress(event) {
    event.preventDefault();
    setAddressSaving(true);
    setAddressFormError("");
    try {
      if (editingAddressId) {
        await updateCustomerAddress(customerId, editingAddressId, addressForm);
      } else {
        await createCustomerAddress(customerId, addressForm);
      }
      setAddressModalOpen(false);
      await loadAddresses();
    } catch (err) {
      setAddressFormError(err.message || "Failed to save address.");
    } finally {
      setAddressSaving(false);
    }
  }

  async function onDeleteAddress(addressId) {
    if (!window.confirm("Remove this saved address?")) {
      return;
    }
    try {
      await deleteCustomerAddress(customerId, addressId);
      await loadAddresses();
    } catch (err) {
      window.alert(err.message || "Failed to remove address.");
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading customer..." />;
  }
  if (error) {
    return <ErrorBlock message={error} onRetry={loadCore} />;
  }
  if (!customer) {
    return null;
  }

  const displayName = customer.name || customer.companyName || customer.email || customer.id;

  return (
    <>
      <PageHeader
        title={displayName}
        description={`${customer.id}${customer.customerCode ? ` · Code: ${customer.customerCode}` : ""}`}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/customers")}>← Back</button>
            {canManage ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={toggleBlockStatus}
                disabled={blockBusy}
                style={customer.accountStatus === "blocked" ? { color: "#16a34a", borderColor: "rgba(22,163,74,0.4)" } : { color: "#dc2626", borderColor: "rgba(220,38,38,0.3)" }}
              >
                {blockBusy ? "Working..." : customer.accountStatus === "blocked" ? "Unblock Customer" : "Block Customer"}
              </button>
            ) : null}
            {canManage ? (
              <button type="button" className="btn btn-primary" onClick={openEditModal}>Edit Customer</button>
            ) : null}
          </>
        }
      />

      {/* ── Contact + business summary ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Email</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827" }}>{customer.email || "—"}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Mobile</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827" }}>{customer.mobile || "—"}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Customer Type</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827", textTransform: "capitalize" }}>{customer.customerType}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>B2B Approval</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: customer.isB2BApproved ? "#16a34a" : "#6b7280" }}>
              {customer.isB2BApproved ? "Approved" : "Not Approved"}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Company</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827" }}>{customer.companyName || "—"}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>GSTIN</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827" }}>{customer.gstin || "—"}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Orders</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827" }}>{customer.orderCount ?? orders.length}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Customer Since</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827" }}>{formatDateTime(customer.createdAt)}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Account Status</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: customer.accountStatus === "blocked" ? "#dc2626" : "#16a34a" }}>
              {customer.accountStatus === "blocked" ? "Blocked" : "Active"}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase" }}>Newsletter</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: customer.newsletterSubscribed ? "#16a34a" : "#6b7280" }}>
              {customer.newsletterSubscribed ? "Subscribed" : "Not Subscribed"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Addresses ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h4>Addresses</h4>
          {canManage ? (
            <div className="card-actions">
              <button type="button" className="btn btn-secondary btn-small" onClick={openCreateAddressModal}>+ Add Address</button>
            </div>
          ) : null}
        </div>
        {addressesLoading ? (
          <LoadingBlock label="Loading addresses..." />
        ) : addressesError ? (
          <ErrorBlock message={addressesError} onRetry={loadAddresses} />
        ) : addresses.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>No saved addresses.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                canManage={canManage}
                onEdit={openEditAddressModal}
                onDelete={onDeleteAddress}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Order history ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h4>Order History</h4>
        </div>
        {orders.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>No orders yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/orders/${order.id}`} style={{ color: BRAND, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                        {order.orderNo || order.id}
                      </Link>
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{formatDateTime(order.createdAt)}</td>
                    <td style={{ fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>{(order.paymentStatus || "").replace(/_/g, " ") || "—"}</td>
                    <td style={{ fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>{(order.orderStatus || "").replace(/_/g, " ") || "—"}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{formatCurrencyInr(order.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Live cart (not yet converted to an order) ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h4>In Cart (Not Yet Ordered)</h4>
        </div>
        {cartLoading ? (
          <LoadingBlock label="Loading cart..." />
        ) : cartError ? (
          <ErrorBlock message={cartError} onRetry={loadCart} />
        ) : !cart || cart.items.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>Cart is empty.</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map((item) => (
                    <tr key={item.productId}>
                      <td style={{ fontSize: 13, color: "#111827" }}>{item.title}</td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{item.qty}</td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{formatCurrencyInr(item.unitPrice)}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{formatCurrencyInr(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "#111827", textAlign: "right" }}>
              Cart Value: {formatCurrencyInr(cart.cartValue)}
            </p>
          </>
        )}
      </div>

      {/* ── Abandoned cart history ── */}
      {canViewMarketing ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h4>Abandoned Cart History</h4>
          </div>
          {abandonedLoading ? (
            <LoadingBlock label="Loading abandoned cart history..." />
          ) : abandonedError ? (
            <ErrorBlock message={abandonedError} onRetry={loadAbandoned} />
          ) : abandoned.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>No abandoned carts recorded for this customer.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Items</th>
                    <th>Cart Value</th>
                    <th>Last Activity</th>
                    <th>Reminders Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {abandoned.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>{row.stage}</td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{row.cartItemCount}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{formatCurrencyInr(row.cartValue)}</td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{formatDateTime(row.lastActivityAt)}</td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{row.reminderCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Edit Customer Modal ── */}
      <Modal open={editOpen} title={`Edit ${displayName}`} onClose={() => setEditOpen(false)}>
        {editForm ? (
          <form className="form-grid" onSubmit={onSaveEdit}>
            {editError ? (
              <div className="field-full" style={{ color: "#dc2626", fontSize: 13, marginBottom: 4 }}>{editError}</div>
            ) : null}
            <label className="field">
              <span>Name</span>
              <input name="name" value={editForm.name} onChange={onEditFormChange} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" name="email" value={editForm.email} onChange={onEditFormChange} />
            </label>
            <label className="field">
              <span>Mobile</span>
              <input name="mobile" value={editForm.mobile} onChange={onEditFormChange} />
            </label>
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
              <label className="inline-check">
                <input type="checkbox" name="newsletterSubscribed" checked={editForm.newsletterSubscribed} onChange={onEditFormChange} />
                <span>Newsletter Subscribed</span>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Customer"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* ── Address Modal ── */}
      <Modal
        open={addressModalOpen}
        title={editingAddressId ? "Edit Address" : "Add Address"}
        onClose={() => setAddressModalOpen(false)}
      >
        <form className="form-grid" onSubmit={onSaveAddress}>
          {addressFormError ? (
            <div className="field-full" style={{ color: "#dc2626", fontSize: 13, marginBottom: 4 }}>{addressFormError}</div>
          ) : null}
          <label className="field">
            <span>Label</span>
            <input name="label" value={addressForm.label} onChange={onAddressFormChange} placeholder="Home / Office" />
          </label>
          <label className="field">
            <span>Name</span>
            <input name="name" value={addressForm.name} onChange={onAddressFormChange} required />
          </label>
          <label className="field">
            <span>Mobile</span>
            <input name="mobile" value={addressForm.mobile} onChange={onAddressFormChange} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" name="email" value={addressForm.email} onChange={onAddressFormChange} />
          </label>
          <label className="field field-full">
            <span>Address Line 1</span>
            <input name="addressLine1" value={addressForm.addressLine1} onChange={onAddressFormChange} required />
          </label>
          <label className="field field-full">
            <span>Address Line 2</span>
            <input name="addressLine2" value={addressForm.addressLine2} onChange={onAddressFormChange} />
          </label>
          <label className="field">
            <span>City</span>
            <input name="city" value={addressForm.city} onChange={onAddressFormChange} required />
          </label>
          <label className="field">
            <span>State</span>
            <input name="state" value={addressForm.state} onChange={onAddressFormChange} required />
          </label>
          <label className="field">
            <span>State Code</span>
            <input name="stateCode" value={addressForm.stateCode} onChange={onAddressFormChange} placeholder="e.g. 36" />
          </label>
          <label className="field">
            <span>Pincode</span>
            <input name="pincode" value={addressForm.pincode} onChange={onAddressFormChange} required />
          </label>
          <label className="field">
            <span>Country</span>
            <input name="country" value={addressForm.country} onChange={onAddressFormChange} />
          </label>
          <div className="field-full check-row">
            <label className="inline-check">
              <input type="checkbox" name="isDefaultBilling" checked={addressForm.isDefaultBilling} onChange={onAddressFormChange} />
              <span>Default Billing</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="isDefaultShipping" checked={addressForm.isDefaultShipping} onChange={onAddressFormChange} />
              <span>Default Shipping</span>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setAddressModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={addressSaving}>
              {addressSaving ? "Saving..." : "Save Address"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
