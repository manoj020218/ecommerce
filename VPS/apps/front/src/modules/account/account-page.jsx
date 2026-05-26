import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
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

function MetricCard({ value, label, meta }) {
  return (
    <div className="metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
      {meta ? <small>{meta}</small> : null}
    </div>
  );
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
  const [guestOrderId, setGuestOrderId] = useState("");

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
      await createCustomerAddress(addressForm);
      setAddressForm(EMPTY_ADDRESS);
      setNotice("Address saved.");
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
      <main className="front-shell">
        <div className="state-box">Loading your account dashboard...</div>
      </main>
    );
  }

  const savedProducts = Array.isArray(dashboard?.savedProducts) ? dashboard.savedProducts : [];
  const savedAddresses = Array.isArray(dashboard?.savedAddresses) ? dashboard.savedAddresses : [];
  const recentSearches = Array.isArray(dashboard?.recentSearches) ? dashboard.recentSearches : [];
  const recentlyViewed = Array.isArray(dashboard?.recentlyViewed) ? dashboard.recentlyViewed : [];
  const support = dashboard?.support || {};

  return (
    <main className="front-shell account-shell">
      <header className="front-header account-hero">
        <div className="hero-kicker-row">
          <Link to="/" className="inline-link">Back to storefront</Link>
          <button
            type="button"
            className="btn secondary compact-btn"
            onClick={handleLogout}
            disabled={busy === "logout"}
          >
            {busy === "logout" ? "Signing out..." : "Logout"}
          </button>
        </div>
        <div className="account-hero-copy">
          <div>
            <p className="eyebrow-text">My Account</p>
            <h1>{dashboard?.profile?.name || customer?.name || "Customer"}</h1>
            <p className="hero-muted">
              {dashboard?.profile?.email || "No email linked"} <span className="hero-divider">•</span>{" "}
              {dashboard?.profile?.mobile || "No mobile linked"}
            </p>
            <div className="chip-row">
              <span className="eyebrow-chip">
                {dashboard?.profile?.verifiedEmail ? "Verified email" : "Email not verified"}
              </span>
              <span className="eyebrow-chip">
                {dashboard?.profile?.verifiedMobile ? "Verified mobile" : "Mobile not verified"}
              </span>
            </div>
          </div>
          <div className="hero-stat-grid">
            <MetricCard value={orders.length} label="Orders" meta="Own orders only" />
            <MetricCard value={invoices.length} label="Invoices" meta="GST invoice history" />
            <MetricCard value={tracking.length} label="Tracking" meta="Latest shipment status" />
            <MetricCard value={savedProducts.length} label="Saved" meta="Product shortlist" />
          </div>
        </div>
      </header>

      {error ? <div className="state-box error">{error}</div> : null}
      {notice ? <div className="state-box">{notice}</div> : null}

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head"><h3>My Profile</h3><p>Update display information.</p></div>
          <form className="stack-form" onSubmit={handleProfileSubmit}>
            <div className="field-grid">
              <label><span>Name</span><input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label><span>Company Name</span><input value={profileForm.companyName} onChange={(event) => setProfileForm((current) => ({ ...current, companyName: event.target.value }))} placeholder="Optional" /></label>
              <label><span>Email</span><input value={dashboard?.profile?.email || ""} disabled /></label>
              <label><span>Mobile</span><input value={dashboard?.profile?.mobile || ""} disabled /></label>
            </div>
            <button type="submit" className="btn primary" disabled={busy === "profile"}>{busy === "profile" ? "Saving..." : "Save Profile"}</button>
          </form>
        </article>

        <article className="section-card">
          <div className="section-head"><h3>GST Details</h3><p>Maintain invoice-ready tax details.</p></div>
          <form className="stack-form" onSubmit={handleGstSubmit}>
            <div className="field-grid">
              <label><span>GSTIN</span><input value={gstForm.gstin} onChange={(event) => setGstForm((current) => ({ ...current, gstin: event.target.value }))} placeholder="GST number" /></label>
              <label><span>Business Name</span><input value={gstForm.businessName} onChange={(event) => setGstForm((current) => ({ ...current, businessName: event.target.value }))} placeholder="Registered name" /></label>
              <label><span>Contact Name</span><input value={gstForm.contactName} onChange={(event) => setGstForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Invoice contact" /></label>
            </div>
            <button type="submit" className="btn dark" disabled={busy === "gst"}>{busy === "gst" ? "Updating..." : "Save GST Details"}</button>
          </form>
        </article>
      </section>

      <section className="section-card">
        <div className="section-head"><h3>My Orders</h3><p>View totals, shipment status, invoice status, and reorder.</p></div>
        <div className="card-list">
          {orders.length ? orders.map((order) => (
            <div key={order.id} className="list-card">
              <div className="list-card-head">
                <div><strong>{order.orderNo}</strong><p>{formatDate(order.orderDate)}</p></div>
                <div className="list-card-meta"><span className="eyebrow-chip">{humanizeStatus(order.paymentStatus)}</span><span className="eyebrow-chip">{humanizeStatus(order.shipmentStatus)}</span></div>
              </div>
              <div className="detail-pairs compact">
                <div><span>Total</span><strong>{formatCurrency(order.orderTotal)}</strong></div>
                <div><span>Invoice</span><strong>{order.invoiceNumber || "Pending"}</strong></div>
                <div><span>Courier</span><strong>{order.courierName || "Not assigned"}</strong></div>
                <div><span>Tracking</span><strong>{order.trackingId || "Awaiting update"}</strong></div>
              </div>
              <div className="action-row">
                <Link to={`/account/orders/${order.id}`} className="btn secondary">View</Link>
                <button type="button" className="btn secondary" onClick={() => handleDownloadInvoice(order.invoiceId)} disabled={!order.invoiceId}>Invoice</button>
                <Link to={`/account/orders/${order.id}`} className="btn secondary">Track</Link>
                <button type="button" className="btn primary" onClick={() => handleReorder(order.id)} disabled={busy === `reorder:${order.id}`}>{busy === `reorder:${order.id}` ? "Reordering..." : "Reorder"}</button>
              </div>
            </div>
          )) : <div className="empty-panel">No customer orders yet.</div>}
        </div>
      </section>

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head"><h3>My Invoices</h3><p>Download your own invoice records.</p></div>
          <div className="card-list">
            {invoices.length ? invoices.map((invoice) => (
              <div key={invoice.id} className="list-card">
                <div className="list-card-head">
                  <div><strong>{invoice.invoiceNumber}</strong><p>{formatDate(invoice.invoiceDate)}</p></div>
                  <span className="eyebrow-chip">{humanizeStatus(invoice.paymentStatus)}</span>
                </div>
                <div className="detail-pairs compact">
                  <div><span>Order</span><strong>{invoice.orderNo}</strong></div>
                  <div><span>Total</span><strong>{formatCurrency(invoice.grandTotal)}</strong></div>
                </div>
                <div className="action-row"><button type="button" className="btn secondary" onClick={() => handleDownloadInvoice(invoice.id)}>Download JSON</button></div>
              </div>
            )) : <div className="empty-panel">No invoices generated yet.</div>}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head"><h3>My Tracking</h3><p>Latest courier updates entered by admin.</p></div>
          <div className="card-list">
            {tracking.length ? tracking.map((entry) => (
              <div key={entry.orderId} className="list-card">
                <div className="list-card-head">
                  <div><strong>{entry.orderNo}</strong><p>{entry.courierName || "Shipment preparing"}</p></div>
                  <span className="eyebrow-chip">{humanizeStatus(entry.shipmentStatus)}</span>
                </div>
                <div className="detail-pairs compact">
                  <div><span>Tracking ID</span><strong>{entry.trackingId || "Pending"}</strong></div>
                  <div><span>Expected</span><strong>{entry.expectedDeliveryDate || "--"}</strong></div>
                </div>
                <div className="action-row"><Link to={`/account/orders/${entry.orderId}`} className="btn secondary">Open Order</Link>{entry.trackingUrl ? <a className="btn secondary" href={entry.trackingUrl} target="_blank" rel="noreferrer">Courier Link</a> : null}</div>
              </div>
            )) : <div className="empty-panel">No shipment updates yet.</div>}
          </div>
        </article>
      </section>

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head"><h3>My Addresses</h3><p>Saved billing and shipping addresses.</p></div>
          <div className="card-list">
            {savedAddresses.length ? savedAddresses.map((address) => (
              <div key={address.id} className="list-card">
                <div className="list-card-head">
                  <div><strong>{address.label || address.name}</strong><p>{formatAddress(address)}</p></div>
                  <div className="list-card-meta">{address.isDefaultBilling ? <span className="eyebrow-chip">Default billing</span> : null}{address.isDefaultShipping ? <span className="eyebrow-chip">Default shipping</span> : null}</div>
                </div>
                <div className="action-row"><button type="button" className="btn secondary" onClick={() => handleDeleteAddress(address.id)} disabled={busy === `delete-address:${address.id}`}>{busy === `delete-address:${address.id}` ? "Removing..." : "Delete"}</button></div>
              </div>
            )) : <div className="empty-panel">No saved addresses yet.</div>}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head"><h3>Add Address</h3><p>Save address details for faster checkout.</p></div>
          <form className="stack-form" onSubmit={handleAddressSubmit}>
            <div className="field-grid">
              <label><span>Label</span><input value={addressForm.label} onChange={(event) => setAddressForm((current) => ({ ...current, label: event.target.value }))} placeholder="Office / Warehouse" /></label>
              <label><span>Name</span><input value={addressForm.name} onChange={(event) => setAddressForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label><span>Mobile</span><input value={addressForm.mobile} onChange={(event) => setAddressForm((current) => ({ ...current, mobile: event.target.value }))} /></label>
              <label><span>Email</span><input type="email" value={addressForm.email} onChange={(event) => setAddressForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label className="field-span-2"><span>Address Line 1</span><input value={addressForm.addressLine1} onChange={(event) => setAddressForm((current) => ({ ...current, addressLine1: event.target.value }))} required /></label>
              <label className="field-span-2"><span>Address Line 2</span><input value={addressForm.addressLine2} onChange={(event) => setAddressForm((current) => ({ ...current, addressLine2: event.target.value }))} /></label>
              <label><span>City</span><input value={addressForm.city} onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))} required /></label>
              <label><span>State</span><input value={addressForm.state} onChange={(event) => setAddressForm((current) => ({ ...current, state: event.target.value }))} required /></label>
              <label><span>State Code</span><input value={addressForm.stateCode} onChange={(event) => setAddressForm((current) => ({ ...current, stateCode: event.target.value }))} required /></label>
              <label><span>Pincode</span><input value={addressForm.pincode} onChange={(event) => setAddressForm((current) => ({ ...current, pincode: event.target.value }))} required /></label>
            </div>
            <div className="check-row">
              <label className="check-item"><input type="checkbox" checked={addressForm.isDefaultBilling} onChange={(event) => setAddressForm((current) => ({ ...current, isDefaultBilling: event.target.checked }))} /><span>Default billing</span></label>
              <label className="check-item"><input type="checkbox" checked={addressForm.isDefaultShipping} onChange={(event) => setAddressForm((current) => ({ ...current, isDefaultShipping: event.target.checked }))} /><span>Default shipping</span></label>
            </div>
            <button type="submit" className="btn primary" disabled={busy === "address"}>{busy === "address" ? "Saving..." : "Save Address"}</button>
          </form>
        </article>
      </section>

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head"><h3>Saved Products</h3><p>Products you marked for follow-up.</p></div>
          <div className="saved-products-grid">
            {savedProducts.length ? savedProducts.map((product) => (
              <div key={product.id} className="saved-product-card">
                <div className="saved-product-media">{Array.isArray(product.images) && product.images[0] ? <img src={product.images[0]} alt={product.title} loading="lazy" /> : <span>No image</span>}</div>
                <div className="saved-product-body">
                  <strong>{product.title}</strong>
                  <span>{formatCurrency(product.salePrice)}</span>
                  <div className="action-row">
                    <Link to={`/products/${product.slug}`} className="btn secondary">Open</Link>
                    <button type="button" className="btn secondary" onClick={() => handleRemoveSaved(product.id)} disabled={busy === `saved:${product.id}`}>{busy === `saved:${product.id}` ? "Removing..." : "Remove"}</button>
                  </div>
                </div>
              </div>
            )) : <div className="empty-panel">No saved products yet.</div>}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head"><h3>Recently Viewed</h3><p>Signed-in browsing history and recent searches.</p></div>
          <div className="saved-products-grid compact-grid">
            {recentlyViewed.length ? recentlyViewed.map((product) => (
              <Link key={product.id} to={`/products/${product.slug}`} className="saved-product-card compact-card">
                <div className="saved-product-body"><strong>{product.title}</strong><span>{formatCurrency(product.salePrice)}</span></div>
              </Link>
            )) : <div className="empty-panel">No viewing history yet.</div>}
          </div>
          <div className="search-chip-row">
            {recentSearches.length ? recentSearches.map((entry) => (
              <span key={`${entry.query}-${entry.searchedAt}`} className="search-chip">{entry.query}</span>
            )) : <div className="empty-panel">No search history yet.</div>}
          </div>
        </article>
      </section>

      <section className="account-grid">
        <article className="section-card">
          <div className="section-head"><h3>Link Guest Order</h3><p>Requires verified email or verified mobile on your account.</p></div>
          <form className="stack-form" onSubmit={handleLinkGuestOrder}>
            <div className="field-grid"><label><span>Order ID or Order No</span><input value={guestOrderId} onChange={(event) => setGuestOrderId(event.target.value)} placeholder="JNX-ORD-20260525-00001" required /></label></div>
            <button type="submit" className="btn dark" disabled={busy === "link-guest"}>{busy === "link-guest" ? "Linking..." : "Link Guest Order"}</button>
          </form>
        </article>

        <article className="section-card">
          <div className="section-head"><h3>Support</h3><p>Contact the store team directly from your account.</p></div>
          <div className="detail-pairs">
            <div><span>Store</span><strong>{support.storeName || "Jenix India"}</strong></div>
            <div><span>Email</span><strong>{support.supportEmail || "--"}</strong></div>
            <div><span>Phone</span><strong>{support.supportPhone || "--"}</strong></div>
            <div><span>Timing</span><strong>{support.supportTiming || "--"}</strong></div>
          </div>
          <div className="action-row">
            {support.supportEmail ? <a className="btn secondary" href={`mailto:${support.supportEmail}`}>Email</a> : null}
            {support.supportPhone ? <a className="btn secondary" href={`tel:${support.supportPhone}`}>Call</a> : null}
            {support.supportWhatsApp ? <a className="btn whatsapp" href={getSupportWhatsappLink(support.supportWhatsApp, "Need help with my account and order.")} target="_blank" rel="noreferrer">WhatsApp</a> : null}
            {support.googleMapLink ? <a className="btn secondary" href={support.googleMapLink} target="_blank" rel="noreferrer">Map</a> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
