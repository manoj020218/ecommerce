import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontChip,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontSectionHeader,
  StorefrontSelect
} from "../../shared/storefront/storefront-ui";
import { INDIA_GST_STATES } from "../../shared/india-gst-states";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  downloadCustomerInvoice,
  getCustomerAccountBootstrap,
  linkGuestOrder,
  listCustomerInvoices,
  listCustomerOrders,
  listCustomerTracking,
  logoutCustomer,
  removeSavedProduct,
  reorderCustomerOrder,
  updateCustomerGstDetails,
  updateCustomerAddress,
  updateCustomerProfile
} from "./account.api";
import {
  downloadInvoicePayload,
  formatAddress,
  formatCurrency,
  formatDate,
  getSupportWhatsappLink,
  humanizeStatus
} from "./account.utils";

const EMPTY_ADDRESS = {
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

function buildAddressForm(address = {}) {
  return {
    ...EMPTY_ADDRESS,
    ...address,
    country: address.country || "India"
  };
}

function visibleProductPrice(product) {
  return Number(product?.pricing?.visiblePrice ?? product?.salePrice ?? 0);
}

function StatusBadge({ children }) {
  return <StorefrontBadge className="eyebrow-chip">{children}</StorefrontBadge>;
}

function initialsFor(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function CustomerAccountPage() {
  const navigate = useNavigate();
  const { customer, session, setSession, clearSession } = useCustomerSession();
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [profileForm, setProfileForm] = useState({
    name: customer?.name || "",
    companyName: customer?.companyName || ""
  });
  const [gstForm, setGstForm] = useState({
    gstin: "",
    businessName: "",
    contactName: ""
  });
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS);
  const [editingAddressId, setEditingAddressId] = useState("");
  const [guestOrderId, setGuestOrderId] = useState("");
  const addAddressFormRef = useRef(null);

  function redirectToLogin(requestError) {
    if (requestError?.status !== 401) {
      return false;
    }
    clearSession();
    navigate("/account/login?redirect=%2Faccount", { replace: true });
    return true;
  }

  function applySnapshot(snapshot) {
    setDashboard(snapshot.bootstrap);
    setOrders(Array.isArray(snapshot.orders) ? snapshot.orders : []);
    setInvoices(Array.isArray(snapshot.invoices) ? snapshot.invoices : []);
    setTracking(Array.isArray(snapshot.tracking) ? snapshot.tracking : []);
    setProfileForm({
      name: snapshot.bootstrap?.profile?.name || "",
      companyName: snapshot.bootstrap?.profile?.companyName || ""
    });
    setGstForm({
      gstin: snapshot.bootstrap?.gstDetails?.gstin || "",
      businessName: snapshot.bootstrap?.gstDetails?.businessName || "",
      contactName: snapshot.bootstrap?.gstDetails?.contactName || ""
    });
  }

  async function loadAccount(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }
    setError("");
    try {
      const [bootstrap, nextOrders, nextInvoices, nextTracking] = await Promise.all([
        getCustomerAccountBootstrap(6),
        listCustomerOrders(20),
        listCustomerInvoices(20),
        listCustomerTracking(20)
      ]);
      applySnapshot({
        bootstrap,
        orders: nextOrders,
        invoices: nextInvoices,
        tracking: nextTracking
      });
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Failed to load your customer account.");
      }
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadAccount();
  }, []);

  async function handleDownloadInvoice(invoiceId) {
    if (!invoiceId) {
      return;
    }
    setError("");
    setNotice("");
    try {
      const payload = await downloadCustomerInvoice(invoiceId);
      downloadInvoicePayload(payload);
      setNotice("Invoice download prepared.");
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Invoice download failed.");
      }
    }
  }

  async function handleReorder(orderId) {
    setBusy(`reorder:${orderId}`);
    setError("");
    setNotice("");
    try {
      const payload = await reorderCustomerOrder(orderId, { mode: "replace" });
      const changedLines = payload.reconciliation.filter((item) => item.priceChanged).length;
      setNotice(
        `Cart refreshed. ${payload.addedCount} item(s) added and ${changedLines} line(s) changed price.`
      );
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Reorder failed.");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      const profile = await updateCustomerProfile(profileForm);
      setDashboard((current) => (current ? { ...current, profile } : current));
      setSession({
        ...session,
        customer: {
          ...(customer || {}),
          ...profile
        }
      });
      setNotice("Profile updated.");
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Profile update failed.");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleGstSubmit(event) {
    event.preventDefault();
    setBusy("gst");
    setError("");
    setNotice("");
    try {
      const gstDetails = await updateCustomerGstDetails(gstForm);
      setDashboard((current) => (current ? { ...current, gstDetails } : current));
      setNotice("GST details updated.");
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "GST update failed.");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleAddressSubmit(event) {
    event.preventDefault();
    setBusy("address");
    setError("");
    setNotice("");
    try {
      if (editingAddressId) {
        await updateCustomerAddress(editingAddressId, addressForm);
        setNotice("Address updated.");
      } else {
        await createCustomerAddress(addressForm);
        setNotice("Address saved.");
      }
      setEditingAddressId("");
      setAddressForm(EMPTY_ADDRESS);
      await loadAccount(false);
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Address save failed.");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteAddress(addressId) {
    setBusy(`delete-address:${addressId}`);
    setError("");
    setNotice("");
    try {
      await deleteCustomerAddress(addressId);
      if (editingAddressId === addressId) {
        setEditingAddressId("");
        setAddressForm(EMPTY_ADDRESS);
      }
      setNotice("Address removed.");
      await loadAccount(false);
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Address deletion failed.");
      }
    } finally {
      setBusy("");
    }
  }

  function handleEditAddress(address) {
    setEditingAddressId(address.id);
    setAddressForm(buildAddressForm(address));
    setError("");
    setNotice("");
  }

  function handleCancelAddressEdit() {
    setEditingAddressId("");
    setAddressForm(EMPTY_ADDRESS);
    setError("");
    setNotice("");
  }

  function handleAddNewAddress() {
    setEditingAddressId("");
    setAddressForm(EMPTY_ADDRESS);
    setError("");
    setNotice("");
    addAddressFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleRemoveSaved(productId) {
    setBusy(`saved:${productId}`);
    setError("");
    setNotice("");
    try {
      await removeSavedProduct(productId);
      setNotice("Saved product removed.");
      await loadAccount(false);
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Saved product update failed.");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleLinkGuestOrder(event) {
    event.preventDefault();
    setBusy("link-guest");
    setError("");
    setNotice("");
    try {
      const payload = await linkGuestOrder({ orderId: guestOrderId });
      setGuestOrderId("");
      setNotice(`Guest order ${payload.order.orderNo} linked successfully.`);
      await loadAccount(false);
    } catch (requestError) {
      if (!redirectToLogin(requestError)) {
        setError(requestError.message || "Guest order link failed.");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleLogout() {
    setBusy("logout");
    try {
      if (session?.refreshToken) {
        await logoutCustomer(session.refreshToken);
      }
    } catch (_error) {
      // Ignore API logout failure and clear local session.
    } finally {
      clearSession();
      navigate("/account/login", { replace: true });
    }
  }

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading your account dashboard..." />
      </main>
    );
  }

  const savedProducts = Array.isArray(dashboard?.savedProducts) ? dashboard.savedProducts : [];
  const savedAddresses = Array.isArray(dashboard?.savedAddresses) ? dashboard.savedAddresses : [];
  const recentSearches = Array.isArray(dashboard?.recentSearches) ? dashboard.recentSearches : [];
  const recentlyViewed = Array.isArray(dashboard?.recentlyViewed) ? dashboard.recentlyViewed : [];
  const support = dashboard?.support || {};
  const profile = dashboard?.profile || {};
  const isEditingAddress = Boolean(editingAddressId);

  const displayName = dashboard?.profile?.name || customer?.name || "Customer";

  return (
    <main className="proto-main-shell account-shell">
      <div className="account-topbar">
        <StorefrontButton to="/" variant="light" className="auth-back-link">
          ← Back to shop
        </StorefrontButton>
        <StorefrontButton
          type="button"
          variant="light"
          className="auth-back-link"
          onClick={handleLogout}
          disabled={busy === "logout"}
        >
          {busy === "logout" ? "Signing out..." : "Logout"}
        </StorefrontButton>
      </div>

      <article className="account-profile-card">
        <div className="account-profile-avatar" aria-hidden="true">{initialsFor(displayName)}</div>
        <div className="account-profile-info">
          <h1>{displayName}</h1>
          <p>
            {dashboard?.profile?.email || "No email linked"} · {dashboard?.profile?.mobile || "No mobile linked"}
          </p>
          <div className="account-profile-badges">
            <StatusBadge>
              {dashboard?.profile?.verifiedEmail ? "Verified email" : "Email not verified"}
            </StatusBadge>
            <StatusBadge>
              {dashboard?.profile?.verifiedMobile ? "Verified mobile" : "Mobile not verified"}
            </StatusBadge>
            <StatusBadge>{humanizeStatus(profile.customerType || "retail")}</StatusBadge>
            {profile.isB2BApproved ? <StatusBadge>B2B Approved</StatusBadge> : null}
            {profile.priceGroup ? (
              <StatusBadge>Price Group: {humanizeStatus(profile.priceGroup)}</StatusBadge>
            ) : null}
            {profile.orderMode ? (
              <StatusBadge>Order Mode: {humanizeStatus(profile.orderMode)}</StatusBadge>
            ) : null}
          </div>
        </div>
      </article>

      <div className="account-stat-strip">
        <div className="account-stat">
          <strong>{orders.length}</strong>
          <span>Orders</span>
        </div>
        <div className="account-stat">
          <strong>{invoices.length}</strong>
          <span>Invoices</span>
        </div>
        <div className="account-stat">
          <strong>{tracking.length}</strong>
          <span>Tracking</span>
        </div>
        <div className="account-stat">
          <strong>{savedProducts.length}</strong>
          <span>Saved</span>
        </div>
      </div>

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="My Profile"
            description="Update display information."
          />
          <form className="stack-form" onSubmit={handleProfileSubmit}>
            <div className="field-grid">
              <StorefrontInput
                label="Name"
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                required
              />
              <StorefrontInput
                label="Company Name"
                value={profileForm.companyName}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    companyName: event.target.value
                  }))
                }
                placeholder="Optional"
              />
              <StorefrontInput label="Email" value={dashboard?.profile?.email || ""} disabled />
              <StorefrontInput label="Mobile" value={dashboard?.profile?.mobile || ""} disabled />
            </div>
            <StorefrontButton type="submit" disabled={busy === "profile"}>
              {busy === "profile" ? "Saving..." : "Save Profile"}
            </StorefrontButton>
          </form>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="GST Details"
            description="Maintain invoice-ready tax details."
          />
          <form className="stack-form" onSubmit={handleGstSubmit}>
            <div className="field-grid">
              <StorefrontInput
                label="GSTIN"
                value={gstForm.gstin}
                onChange={(event) =>
                  setGstForm((current) => ({
                    ...current,
                    gstin: event.target.value
                  }))
                }
                placeholder="GST number"
              />
              <StorefrontInput
                label="Business Name"
                value={gstForm.businessName}
                onChange={(event) =>
                  setGstForm((current) => ({
                    ...current,
                    businessName: event.target.value
                  }))
                }
                placeholder="Registered name"
              />
              <StorefrontInput
                label="Contact Name"
                value={gstForm.contactName}
                onChange={(event) =>
                  setGstForm((current) => ({
                    ...current,
                    contactName: event.target.value
                  }))
                }
                placeholder="Invoice contact"
              />
            </div>
            <StorefrontButton type="submit" variant="dark" disabled={busy === "gst"}>
              {busy === "gst" ? "Updating..." : "Save GST Details"}
            </StorefrontButton>
          </form>
        </StorefrontCard>
      </section>

      <StorefrontCard as="section" className="section-card" elevated>
        <StorefrontSectionHeader
          title="My Orders"
          description="View totals, shipment status, invoice status, and reorder."
        />
        <div className="card-list">
          {orders.length ? (
            orders.map((order) => (
              <div key={order.id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <strong>{order.orderNo}</strong>
                    <p>{formatDate(order.orderDate)}</p>
                  </div>
                  <div className="list-card-meta">
                    <StatusBadge>{humanizeStatus(order.paymentStatus)}</StatusBadge>
                    <StatusBadge>{humanizeStatus(order.orderStatus)}</StatusBadge>
                    <StatusBadge>{humanizeStatus(order.shipmentStatus)}</StatusBadge>
                  </div>
                </div>
                <div className="detail-pairs compact">
                  <div><span>Total</span><strong>{formatCurrency(order.orderTotal)}</strong></div>
                  <div><span>Invoice</span><strong>{order.invoiceNumber || "Pending"}</strong></div>
                  <div><span>Courier</span><strong>{order.courierName || "Not assigned"}</strong></div>
                  <div><span>Tracking</span><strong>{order.trackingId || "Awaiting update"}</strong></div>
                </div>
                <div className="action-row">
                  <StorefrontButton to={`/account/orders/${order.id}`} variant="light">
                    View
                  </StorefrontButton>
                  <StorefrontButton
                    type="button"
                    variant="light"
                    onClick={() => handleDownloadInvoice(order.invoiceId)}
                    disabled={!order.invoiceId}
                  >
                    Invoice
                  </StorefrontButton>
                  <StorefrontButton to={`/account/orders/${order.id}`} variant="light">
                    Track
                  </StorefrontButton>
                  <StorefrontButton
                    type="button"
                    onClick={() => handleReorder(order.id)}
                    disabled={busy === `reorder:${order.id}`}
                  >
                    {busy === `reorder:${order.id}` ? "Reordering..." : "Reorder"}
                  </StorefrontButton>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-panel">No customer orders yet.</div>
          )}
        </div>
      </StorefrontCard>

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="My Invoices"
            description="Download your own invoice records."
          />
          <div className="card-list">
            {invoices.length ? (
              invoices.map((invoice) => (
                <div key={invoice.id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <strong>{invoice.invoiceNumber}</strong>
                      <p>{formatDate(invoice.invoiceDate)}</p>
                    </div>
                    <StatusBadge>{humanizeStatus(invoice.paymentStatus)}</StatusBadge>
                  </div>
                  <div className="detail-pairs compact">
                    <div><span>Order</span><strong>{invoice.orderNo}</strong></div>
                    <div><span>Total</span><strong>{formatCurrency(invoice.grandTotal)}</strong></div>
                  </div>
                  <div className="action-row">
                    <StorefrontButton
                      type="button"
                      variant="light"
                      onClick={() => handleDownloadInvoice(invoice.id)}
                    >
                      Download Invoice
                    </StorefrontButton>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-panel">No invoices generated yet.</div>
            )}
          </div>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="My Tracking"
            description="Latest courier updates entered by admin."
          />
          <div className="card-list">
            {tracking.length ? (
              tracking.map((entry) => (
                <div key={entry.orderId} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <strong>{entry.orderNo}</strong>
                      <p>{entry.courierName || "Shipment preparing"}</p>
                    </div>
                    <StatusBadge>{humanizeStatus(entry.shipmentStatus)}</StatusBadge>
                  </div>
                  <div className="detail-pairs compact">
                    <div><span>Tracking ID</span><strong>{entry.trackingId || "Pending"}</strong></div>
                    <div><span>Expected</span><strong>{entry.expectedDeliveryDate || "--"}</strong></div>
                  </div>
                  <div className="action-row">
                    <StorefrontButton to={`/account/orders/${entry.orderId}`} variant="light">
                      Open Order
                    </StorefrontButton>
                    {entry.trackingUrl ? (
                      <StorefrontButton
                        href={entry.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        variant="light"
                      >
                        Courier Link
                      </StorefrontButton>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-panel">No shipment updates yet.</div>
            )}
          </div>
        </StorefrontCard>
      </section>

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="My Addresses"
            description="Save as many billing and shipping addresses as you need."
            action={
              <StorefrontButton type="button" variant="light" onClick={handleAddNewAddress}>
                + Add New Address
              </StorefrontButton>
            }
          />
          <div className="card-list">
            {savedAddresses.length ? (
              savedAddresses.map((address) => (
                <div key={address.id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <strong>{address.label || address.name}</strong>
                      <p>{formatAddress(address)}</p>
                    </div>
                    <div className="list-card-meta">
                      {address.isDefaultBilling ? <StatusBadge>Default billing</StatusBadge> : null}
                      {address.isDefaultShipping ? <StatusBadge>Default shipping</StatusBadge> : null}
                    </div>
                  </div>
                  <div className="action-row">
                    <StorefrontButton
                      type="button"
                      variant="light"
                      onClick={() => handleEditAddress(address)}
                      disabled={busy === "address"}
                    >
                      {editingAddressId === address.id ? "Editing" : "Edit"}
                    </StorefrontButton>
                    <StorefrontButton
                      type="button"
                      variant="light"
                      onClick={() => handleDeleteAddress(address.id)}
                      disabled={busy === `delete-address:${address.id}`}
                    >
                      {busy === `delete-address:${address.id}` ? "Removing..." : "Delete"}
                    </StorefrontButton>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-panel">No saved addresses yet.</div>
            )}
          </div>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <div ref={addAddressFormRef} style={{ scrollMarginTop: 16 }} />
          <StorefrontSectionHeader
            title={isEditingAddress ? "Edit Address" : "Add Address"}
            description={
              isEditingAddress
                ? "Update the saved address and default flags."
                : "Save address details for faster checkout."
            }
          />
          {isEditingAddress ? (
            <StorefrontAlert>
              Editing {addressForm.label || addressForm.name || "saved address"}.
            </StorefrontAlert>
          ) : null}
          <form className="stack-form" onSubmit={handleAddressSubmit}>
            <div className="field-grid">
              <StorefrontInput
                label="Label"
                value={addressForm.label}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    label: event.target.value
                  }))
                }
                placeholder="Office / Warehouse"
              />
              <StorefrontInput
                label="Name"
                value={addressForm.name}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                required
              />
              <StorefrontInput
                label="Mobile"
                value={addressForm.mobile}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    mobile: event.target.value
                  }))
                }
              />
              <StorefrontInput
                label="Email"
                type="email"
                value={addressForm.email}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    email: event.target.value
                  }))
                }
              />
              <StorefrontInput
                label="Address Line 1"
                fieldClassName="field-span-2"
                value={addressForm.addressLine1}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    addressLine1: event.target.value
                  }))
                }
                required
              />
              <StorefrontInput
                label="Address Line 2"
                fieldClassName="field-span-2"
                value={addressForm.addressLine2}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    addressLine2: event.target.value
                  }))
                }
              />
              <StorefrontInput
                label="City"
                value={addressForm.city}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    city: event.target.value
                  }))
                }
                required
              />
              <StorefrontSelect
                label="State"
                value={addressForm.stateCode}
                onChange={(event) => {
                  const nextState = INDIA_GST_STATES.find((row) => row.code === event.target.value);
                  setAddressForm((current) => ({
                    ...current,
                    stateCode: nextState?.code || "",
                    state: nextState?.name || ""
                  }));
                }}
                required
              >
                <option value="">Select state</option>
                {INDIA_GST_STATES.map((row) => (
                  <option key={row.code} value={row.code}>{row.name}</option>
                ))}
              </StorefrontSelect>
              <StorefrontInput
                label="Pincode"
                value={addressForm.pincode}
                onChange={(event) =>
                  setAddressForm((current) => ({
                    ...current,
                    pincode: event.target.value
                  }))
                }
                required
              />
            </div>
            <div className="check-row">
              <label className="check-item">
                <input
                  type="checkbox"
                  checked={addressForm.isDefaultBilling}
                  onChange={(event) =>
                    setAddressForm((current) => ({
                      ...current,
                      isDefaultBilling: event.target.checked
                    }))
                  }
                />
                <span>Default billing</span>
              </label>
              <label className="check-item">
                <input
                  type="checkbox"
                  checked={addressForm.isDefaultShipping}
                  onChange={(event) =>
                    setAddressForm((current) => ({
                      ...current,
                      isDefaultShipping: event.target.checked
                    }))
                  }
                />
                <span>Default shipping</span>
              </label>
            </div>
            <div className="action-row">
              <StorefrontButton type="submit" disabled={busy === "address"}>
                {busy === "address"
                  ? isEditingAddress
                    ? "Updating..."
                    : "Saving..."
                  : isEditingAddress
                    ? "Update Address"
                    : "Save Address"}
              </StorefrontButton>
              {isEditingAddress ? (
                <StorefrontButton
                  type="button"
                  variant="light"
                  onClick={handleCancelAddressEdit}
                  disabled={busy === "address"}
                >
                  Cancel
                </StorefrontButton>
              ) : null}
            </div>
          </form>
        </StorefrontCard>
      </section>

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Saved Products"
            description="Products you marked for follow-up."
          />
          <div className="saved-products-grid">
            {savedProducts.length ? (
              savedProducts.map((product) => (
                <div key={product.id} className="saved-product-card">
                  <div className="saved-product-media">
                    {Array.isArray(product.images) && product.images[0] ? (
                      <img src={product.images[0]} alt={product.title} loading="lazy" />
                    ) : (
                      <span>No image</span>
                    )}
                  </div>
                  <div className="saved-product-body">
                    <strong>{product.title}</strong>
                    <span>{formatCurrency(visibleProductPrice(product))}</span>
                    {product?.pricing?.isB2BPrice ? <small>Approved dealer price</small> : null}
                    <div className="action-row">
                      <StorefrontButton to={`/products/${product.slug}`} variant="light">
                        Open
                      </StorefrontButton>
                      <StorefrontButton
                        type="button"
                        variant="light"
                        onClick={() => handleRemoveSaved(product.id)}
                        disabled={busy === `saved:${product.id}`}
                      >
                        {busy === `saved:${product.id}` ? "Removing..." : "Remove"}
                      </StorefrontButton>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-panel">No saved products yet.</div>
            )}
          </div>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Recently Viewed"
            description="Signed-in browsing history and recent searches."
          />
          <div className="saved-products-grid compact-grid">
            {recentlyViewed.length ? (
              recentlyViewed.map((product) => (
                <Link
                  key={product.id}
                  to={`/products/${product.slug}`}
                  className="saved-product-card compact-card"
                >
                  <div className="saved-product-body">
                    <strong>{product.title}</strong>
                    <span>{formatCurrency(visibleProductPrice(product))}</span>
                    {product?.pricing?.isB2BPrice ? <small>Approved dealer price</small> : null}
                  </div>
                </Link>
              ))
            ) : (
              <div className="empty-panel">No viewing history yet.</div>
            )}
          </div>
          <div className="search-chip-row">
            {recentSearches.length ? (
              recentSearches.map((entry) => (
                <StorefrontChip key={`${entry.query}-${entry.searchedAt}`} as="span" className="search-chip">
                  {entry.query}
                </StorefrontChip>
              ))
            ) : (
              <div className="empty-panel">No search history yet.</div>
            )}
          </div>
        </StorefrontCard>
      </section>

      <section className="account-grid">
        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Link Guest Order"
            description="Requires verified email or verified mobile on your account."
          />
          <form className="stack-form" onSubmit={handleLinkGuestOrder}>
            <div className="field-grid">
              <StorefrontInput
                label="Order ID or Order No"
                value={guestOrderId}
                onChange={(event) => setGuestOrderId(event.target.value)}
                placeholder="JNX-ORD-20260525-00001"
                required
              />
            </div>
            <StorefrontButton type="submit" variant="dark" disabled={busy === "link-guest"}>
              {busy === "link-guest" ? "Linking..." : "Link Guest Order"}
            </StorefrontButton>
          </form>
        </StorefrontCard>

        <StorefrontCard as="article" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Support"
            description="Contact the store team directly from your account."
          />
          <div className="detail-pairs">
            <div><span>Store</span><strong>{support.storeName || "Jenix India"}</strong></div>
            <div><span>Email</span><strong>{support.supportEmail || "--"}</strong></div>
            <div><span>Phone</span><strong>{support.supportPhone || "--"}</strong></div>
            <div><span>Timing</span><strong>{support.supportTiming || "--"}</strong></div>
          </div>
          <div className="action-row">
            {support.supportEmail ? (
              <StorefrontButton href={`mailto:${support.supportEmail}`} variant="light">
                Email
              </StorefrontButton>
            ) : null}
            {support.supportPhone ? (
              <StorefrontButton href={`tel:${support.supportPhone}`} variant="light">
                Call
              </StorefrontButton>
            ) : null}
            {support.supportWhatsApp ? (
              <StorefrontButton
                href={getSupportWhatsappLink(
                  support.supportWhatsApp,
                  "Need help with my account and order."
                )}
                target="_blank"
                rel="noreferrer"
                variant="whatsapp"
              >
                WhatsApp
              </StorefrontButton>
            ) : null}
            {support.googleMapLink ? (
              <StorefrontButton
                href={support.googleMapLink}
                target="_blank"
                rel="noreferrer"
                variant="light"
              >
                Map
              </StorefrontButton>
            ) : null}
          </div>
        </StorefrontCard>
      </section>
    </main>
  );
}
