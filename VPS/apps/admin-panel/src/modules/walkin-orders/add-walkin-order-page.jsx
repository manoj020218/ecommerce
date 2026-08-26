import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { hasPermission } from "../../shared/utils/permissions";
import { formatCurrencyInr } from "../../shared/utils/formatters";
import { fetchOrderDetail } from "../orders/orders.api";
import { fetchProduct } from "../products/products.api";
import {
  createWalkInOrder,
  updateWalkInOrder,
  fetchWalkInCategories,
  saveWalkInCustomer,
  searchWalkInCustomers,
  searchWalkInProducts
} from "./walkin-orders.api";

// ── Pricing helpers ───────────────────────────────────────────────────────────

function normalizeMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getDefaultPriceMode(customerType) {
  if (customerType === "dealer") return "dealer";
  if (customerType === "stockist") return "stockist";
  return "retail";
}

function resolveRetailUnitPrice(product, qty) {
  const salePrice = Number(product?.salePrice || 0);
  let unitPrice = salePrice > 0 ? salePrice : Number(product?.basePrice || 0);
  if (product?.bulkPricingEnabled && Array.isArray(product.bulkPriceSlabs)) {
    const sorted = [...product.bulkPriceSlabs].sort((a, b) => a.minQty - b.minQty);
    for (const slab of sorted) {
      if (qty >= Number(slab.minQty || 0)) unitPrice = Number(slab.unitPrice || unitPrice);
    }
  }
  return normalizeMoney(unitPrice);
}

function resolveLineUnitPrice(product, line) {
  if (!product) return 0;
  const qty = Number(line.qty || 1);
  if (line.priceMode === "custom") return normalizeMoney(line.customUnitPrice);
  if (line.priceMode === "dealer" || line.priceMode === "stockist") {
    const matched = Array.isArray(product.priceGroupPrices)
      ? product.priceGroupPrices.find(r => r.priceGroup === line.priceMode)
      : null;
    if (matched) return normalizeMoney(matched.unitPrice);
  }
  return resolveRetailUnitPrice(product, qty);
}

// Mirrors buildWalkInLine's manual-discount math in walkin-orders.service.js
// (applied before GST) so this on-screen preview matches what the backend
// actually persists -- doesn't include the separate automatic payment-method
// discount, which only the backend knows about (depends on paymentMethod +
// live gateway config), so the real order total may still shift slightly
// after that's applied server-side.
function buildLinePreview(product, line) {
  const qty = Number(line.qty || 0);
  const unitPrice = resolveLineUnitPrice(product, line);
  const grossSubtotal = normalizeMoney(unitPrice * qty);
  const discountPercent = Math.min(100, Math.max(0, Number(line.discountPercent || 0)));
  const discountAmount = discountPercent > 0 ? normalizeMoney(grossSubtotal * (discountPercent / 100)) : 0;
  const taxableValue = normalizeMoney(grossSubtotal - discountAmount);
  const gstAmount = normalizeMoney(taxableValue * (Number(product?.gstRate || 0) / 100));
  return {
    qty,
    unitPrice,
    grossSubtotal,
    discountAmount,
    taxableValue,
    gstRate: Number(product?.gstRate || 0),
    gstAmount,
    lineTotal: normalizeMoney(taxableValue + gstAmount)
  };
}

// Maps a full admin product record (from fetchProduct) into the same shape
// the walk-in product search endpoint returns, so buildLinePreview's pricing
// math works identically whether a line came from search-and-add or from
// pre-filling an existing order for editing.
function toProductCacheEntry(product) {
  return {
    id: product.id,
    title: product.title,
    sku: product.sku || "",
    gstRate: Number(product.gstRate || 0),
    basePrice: Number(product.basePrice || 0),
    salePrice: Number(product.salePrice || 0),
    bulkPricingEnabled: Boolean(product.bulkPricingEnabled),
    bulkPriceSlabs: Array.isArray(product.bulkPriceSlabs) ? product.bulkPriceSlabs : [],
    priceGroupPrices: Array.isArray(product.priceGroupPrices) ? product.priceGroupPrices : []
  };
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const EMPTY_CUSTOMER = {
  name: "", email: "", mobile: "", companyName: "", gstin: "",
  addressLine1: "", addressLine2: "", city: "", state: "", stateCode: "",
  pincode: "", country: "India", customerType: "retail", priceGroup: "", creditAllowed: false
};

const EMPTY_FORM = {
  customerId: "",
  customer: EMPTY_CUSTOMER,
  items: [],
  shippingMethod: "self_pickup",
  shippingCharge: 0,
  paymentMethod: "cash",
  markAsPaid: true,
  generateInvoice: true,
  paymentReference: "",
  orderNote: ""
};

// ── Main page ─────────────────────────────────────────────────────────────────

export function AddWalkInOrderPage() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const isEditMode = Boolean(orderId);
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "orders.create");
  const canEditOrder = hasPermission(session, "orders.edit");
  const canAccess = isEditMode ? canEditOrder : canCreate;

  // customer section
  const [customerMode, setCustomerMode] = useState("search"); // "search" | "new"
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [customerDropOpen, setCustomerDropOpen] = useState(false);
  const custDebounce = useRef(null);
  const custDropRef = useRef(null);

  // product section
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [productDropOpen, setProductDropOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productCache, setProductCache] = useState({});
  const prodDebounce = useRef(null);

  // form
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaveNotice, setCustomerSaveNotice] = useState("");
  const [loadingOrder, setLoadingOrder] = useState(isEditMode);
  const [lockedNotice, setLockedNotice] = useState("");

  useEffect(() => {
    fetchWalkInCategories()
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEditMode) return;
    setLoadingOrder(true);
    setLockedNotice("");
    fetchOrderDetail(orderId)
      .then(async (detail) => {
        if (String(detail?.paymentStatus || "").toLowerCase() === "paid") {
          setLockedNotice("This order is already paid and can no longer be edited. Use the order list to view invoice/fulfilment status instead.");
          return;
        }
        if (String(detail?.orderStatus || "").toLowerCase() === "cancelled") {
          setLockedNotice("This order is cancelled and can no longer be edited.");
          return;
        }
        const billing = detail.billingAddress || {};
        setForm({
          customerId: detail.ownerId || "",
          customer: {
            name: billing.name || "",
            email: billing.email || "",
            mobile: billing.mobile || "",
            companyName: billing.companyName || "",
            gstin: billing.gstin || "",
            addressLine1: billing.addressLine1 || "",
            addressLine2: billing.addressLine2 || "",
            city: billing.city || "",
            state: billing.state || "",
            stateCode: billing.stateCode || "",
            pincode: billing.pincode || "",
            country: billing.country || "India",
            customerType: detail.customerType || "retail",
            priceGroup: detail.priceGroup || "",
            creditAllowed: Boolean(detail.creditAllowed)
          },
          items: (detail.items || []).map(item => ({
            productId: item.productId,
            qty: Number(item.qty || 1),
            priceMode: item.selectedPriceMode || "retail",
            customUnitPrice: item.selectedPriceMode === "custom" ? item.unitPriceUsed : "",
            discountPercent: Number(item.discountPercent || 0)
          })),
          shippingMethod: detail.shippingMethod || "self_pickup",
          shippingCharge: detail.pricing?.shippingCharge || 0,
          paymentMethod: detail.paymentMethod || "cash",
          markAsPaid: false,
          generateInvoice: true,
          paymentReference: detail.gatewayTxnId || "",
          orderNote: detail.orderNote || ""
        });
        setCustomerQuery(billing.companyName || billing.name || "");

        const productIds = [...new Set((detail.items || []).map(i => i.productId))];
        const products = await Promise.all(productIds.map(id => fetchProduct(id).catch(() => null)));
        setProductCache(prev => {
          const next = { ...prev };
          products.forEach(p => { if (p) next[p.id] = toProductCacheEntry(p); });
          return next;
        });
      })
      .catch(e => setError(e.message || "Failed to load order."))
      .finally(() => setLoadingOrder(false));
  }, [isEditMode, orderId]);

  // ── Customer search ─────────────────────────────────────────────────────────

  const onCustomerQueryChange = (val) => {
    setCustomerQuery(val);
    clearTimeout(custDebounce.current);
    if (val.trim().length >= 2) {
      custDebounce.current = setTimeout(async () => {
        const results = await searchWalkInCustomers({ q: val, limit: 8 }).catch(() => []);
        setCustomerResults(Array.isArray(results) ? results : []);
        setCustomerDropOpen(true);
      }, 300);
    } else {
      setCustomerResults([]);
      setCustomerDropOpen(false);
    }
  };

  const selectCustomer = (customer) => {
    setForm(f => ({
      ...f,
      customerId: customer.id,
      customer: {
        name: customer.name || "",
        email: customer.email || "",
        mobile: customer.mobile || "",
        companyName: customer.companyName || "",
        gstin: customer.gstin || "",
        addressLine1: customer.address?.addressLine1 || "",
        addressLine2: customer.address?.addressLine2 || "",
        city: customer.address?.city || "",
        state: customer.address?.state || "",
        stateCode: customer.address?.stateCode || "",
        pincode: customer.address?.pincode || "",
        country: customer.address?.country || "India",
        customerType: customer.customerType || "retail",
        priceGroup: customer.priceGroup || "",
        creditAllowed: Boolean(customer.creditAllowed)
      }
    }));
    setCustomerQuery(customer.companyName || customer.name || "");
    setCustomerDropOpen(false);
    setCustomerResults([]);
  };

  const clearCustomer = () => {
    setForm(f => ({ ...f, customerId: "", customer: EMPTY_CUSTOMER }));
    setCustomerQuery("");
  };

  // ── Product search ──────────────────────────────────────────────────────────

  const onProductQueryChange = (val) => {
    setProductQuery(val);
    clearTimeout(prodDebounce.current);
    if (val.trim().length >= 2) {
      prodDebounce.current = setTimeout(async () => {
        const results = await searchWalkInProducts({ q: val, categoryId: categoryFilter, limit: 12 }).catch(() => []);
        const rows = Array.isArray(results) ? results : [];
        setProductResults(rows);
        setProductCache(prev => {
          const next = { ...prev };
          rows.forEach(p => { next[p.id] = p; });
          return next;
        });
        setProductDropOpen(true);
      }, 300);
    } else {
      setProductResults([]);
      setProductDropOpen(false);
    }
  };

  const addProduct = (product) => {
    setProductCache(prev => ({ ...prev, [product.id]: product }));
    setForm(f => {
      const existing = f.items.find(i => i.productId === product.id);
      if (existing) {
        return { ...f, items: f.items.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i) };
      }
      return {
        ...f,
        items: [...f.items, {
          productId: product.id,
          qty: 1,
          priceMode: getDefaultPriceMode(f.customer.customerType),
          customUnitPrice: "",
          discountPercent: 0
        }]
      };
    });
    setProductQuery("");
    setProductDropOpen(false);
    setProductResults([]);
  };

  const updateLine = (productId, patch) => {
    setForm(f => ({ ...f, items: f.items.map(i => i.productId === productId ? { ...i, ...patch } : i) }));
  };

  const removeLine = (productId) => {
    setForm(f => ({ ...f, items: f.items.filter(i => i.productId !== productId) }));
  };

  const setCustomerField = (key, val) => {
    setForm(f => ({ ...f, customer: { ...f.customer, [key]: val } }));
  };

  const handleSaveCustomer = async () => {
    if (!form.customer.name.trim() || form.customer.name.trim().length < 2) {
      setError("Customer name is required (minimum 2 characters) to save the customer.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!form.customer.mobile.trim() || form.customer.mobile.trim().length < 8) {
      setError("Customer mobile is required (minimum 8 digits) to save the customer.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSavingCustomer(true);
    setError("");
    setCustomerSaveNotice("");
    try {
      const data = await saveWalkInCustomer(form.customer);
      const customer = data?.customer;
      if (customer?.id) {
        setForm(f => ({ ...f, customerId: customer.id }));
      }
      setCustomerSaveNotice(
        data?.created ? "Customer saved. You can retrieve them next time from Existing Customer search." : "Customer details updated."
      );
    } catch (e) {
      setError(e.message || "Failed to save customer.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSavingCustomer(false);
    }
  };

  // ── Summary ─────────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const lines = form.items.map(line => buildLinePreview(productCache[line.productId], line));
    const taxableValue = lines.reduce((s, l) => s + l.taxableValue, 0);
    const productGstTotal = lines.reduce((s, l) => s + l.gstAmount, 0);
    const discountTotal = lines.reduce((s, l) => s + l.discountAmount, 0);
    const shipCharge = form.shippingMethod === "self_pickup" ? 0 : normalizeMoney(form.shippingCharge);

    // Mirrors calculateWalkInPricing's blended, value-weighted GST rate
    // applied to the shipping charge -- keeps this on-screen preview in
    // sync with what the backend actually charges the buyer.
    let rateWeightNumerator = 0;
    let rateWeightDenominator = 0;
    lines.forEach(l => {
      if (l.taxableValue > 0) {
        rateWeightNumerator += l.taxableValue * l.gstRate;
        rateWeightDenominator += l.taxableValue;
      }
    });
    const blendedGstRate = rateWeightDenominator > 0 ? rateWeightNumerator / rateWeightDenominator : 0;
    const shippingGstAmount = normalizeMoney((shipCharge * blendedGstRate) / 100);
    const gstTotal = productGstTotal + shippingGstAmount;

    return {
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      taxableValue,
      gstTotal,
      shippingGstAmount,
      discountTotal,
      shippingCharge: shipCharge,
      grandTotal: normalizeMoney(taxableValue + gstTotal + shipCharge)
    };
  }, [form.items, form.shippingMethod, form.shippingCharge, productCache]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const validate = () => {
    if (!form.customer.name.trim() || form.customer.name.trim().length < 2)
      return "Customer name is required (minimum 2 characters).";
    if (!form.customer.mobile.trim() || form.customer.mobile.trim().length < 8)
      return "Customer mobile is required (minimum 8 digits).";
    if (form.items.length === 0) return "Add at least one product.";
    for (const item of form.items) {
      if (item.priceMode === "custom" && !normalizeMoney(item.customUnitPrice))
        return `Enter custom price for: ${productCache[item.productId]?.title || item.productId}`;
    }
    return null;
  };

  const submit = async (asDraft = false) => {
    const validErr = validate();
    if (validErr) { setError(validErr); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setSaving(true);
    setError("");
    try {
      const itemsPayload = form.items.map(item => ({
        productId: item.productId,
        qty: Number(item.qty || 1),
        priceMode: item.priceMode,
        customUnitPrice: item.priceMode === "custom" ? normalizeMoney(item.customUnitPrice) : null,
        discountPercent: Math.min(100, Math.max(0, Number(item.discountPercent || 0)))
      }));

      if (isEditMode) {
        const payload = {
          customerId: form.customerId || undefined,
          customer: form.customer,
          items: itemsPayload,
          shippingMethod: form.shippingMethod,
          shippingCharge: form.shippingMethod === "self_pickup" ? 0 : normalizeMoney(form.shippingCharge),
          paymentMethod: form.paymentMethod,
          paymentReference: form.paymentReference,
          orderNote: form.orderNote
        };
        const data = await updateWalkInOrder(orderId, payload);
        navigate("/walk-in-orders", { state: { notice: `Order ${data.order?.orderNo || ""} updated successfully.` } });
        return;
      }

      // Unpaid, non-draft orders always request a Proforma up front (matching
      // the "remains a Proforma Invoice until payment is confirmed" design) --
      // the "Generate invoice now" checkbox only governs whether a *paid*
      // order also gets its Tax Invoice generated immediately vs. later.
      // Previously this collapsed to false for every unpaid order too,
      // silently skipping Proforma generation at creation time (it would
      // still get created lazily on first "Send for Payment").
      const payload = {
        ...form,
        markAsPaid: asDraft ? false : form.markAsPaid,
        generateInvoice: asDraft ? false : (form.markAsPaid ? form.generateInvoice : true),
        shippingCharge: form.shippingMethod === "self_pickup" ? 0 : normalizeMoney(form.shippingCharge),
        items: itemsPayload
      };
      const data = await createWalkInOrder(payload);
      const notice = data?.invoice?.invoiceNumber
        ? `Order ${data.order?.orderNo} created · Invoice ${data.invoice.invoiceNumber}`
        : `Order ${data.order?.orderNo || ""} created successfully.`;
      navigate("/walk-in-orders", { state: { notice } });
    } catch (e) {
      setError(e.message || (isEditMode ? "Failed to save changes." : "Failed to create order."));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
      You do not have permission to {isEditMode ? "edit" : "create"} walk-in orders.
    </div>
  );

  if (isEditMode && loadingOrder) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
      Loading order…
    </div>
  );

  if (isEditMode && lockedNotice) return (
    <div style={{ padding: "24px 28px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 10, padding: "18px 20px", fontSize: 14, color: "#92400e" }}>
        {lockedNotice}
      </div>
      <button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate("/walk-in-orders")}>
        Back to Walk-in Orders
      </button>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const inputStyle = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, width: "100%", background: "var(--surface)", boxSizing: "border-box" };
  const labelStyle = { display: "flex", flexDirection: "column", gap: 4 };
  const labelTextStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px" };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
        <span style={{ cursor: "pointer", color: "var(--brand)" }} onClick={() => navigate("/walk-in-orders")}>Walk-in Orders</span>
        <span style={{ margin: "0 6px" }}>›</span>
        <span>{isEditMode ? "Edit Order" : "New Order"}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{isEditMode ? "Edit Order" : "Add Order"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/walk-in-orders")} disabled={saving}>Cancel</button>
          {isEditMode ? (
            <button type="button" className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => submit(true)} disabled={saving}>
                {saving ? "Saving…" : "Save as Draft"}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
                {saving ? "Saving…" : "Save as Order"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* ── Customer Card ───────────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 14 }}>
        {/* Card header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Customer</h3>
          {/* Mode tabs */}
          <div style={{ display: "flex", background: "var(--bg)", borderRadius: 8, padding: 3, gap: 2, border: "1px solid var(--border)" }}>
            {[["search", "Existing Customer"], ["new", "Walk-In / New"]].map(([mode, label]) => (
              <button key={mode} type="button"
                onClick={() => { setCustomerMode(mode); clearCustomer(); }}
                style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "none",
                  cursor: "pointer", background: customerMode === mode ? "var(--brand)" : "transparent",
                  color: customerMode === mode ? "#fff" : "var(--muted)"
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {customerMode === "search" ? (
          <div style={{ position: "relative" }} ref={custDropRef}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  value={customerQuery}
                  onChange={e => onCustomerQueryChange(e.target.value)}
                  onFocus={() => customerResults.length > 0 && setCustomerDropOpen(true)}
                  onBlur={() => setTimeout(() => setCustomerDropOpen(false), 150)}
                  placeholder="Search by name, mobile, email, GSTIN..."
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>
              {form.customerId && (
                <button type="button" className="btn btn-secondary btn-small" onClick={clearCustomer}>Clear</button>
              )}
            </div>

            {/* Dropdown */}
            {customerDropOpen && customerResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
                boxShadow: "0 4px 20px rgba(0,0,0,0.14)", marginTop: 4, maxHeight: 260, overflowY: "auto"
              }}>
                {customerResults.map(c => (
                  <button key={c.id} type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectCustomer(c)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-start",
                      width: "100%", padding: "10px 14px", background: "none", border: "none",
                      borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left",
                      transition: "background 0.1s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{c.companyName || c.name}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      {[c.mobile, c.email, c.customerType].filter(Boolean).join(" · ")}
                    </span>
                    {c.gstin && <span style={{ fontSize: 11, color: "var(--muted)" }}>GSTIN: {c.gstin}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Selected customer pill */}
            {form.customerId && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 8, padding: "9px 14px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <strong style={{ color: "var(--text)" }}>{form.customer.companyName || form.customer.name}</strong>
                  {form.customer.mobile && <span style={{ color: "var(--muted)", marginLeft: 10 }}>{form.customer.mobile}</span>}
                  <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>· {form.customer.customerType}</span>
                  {form.customer.gstin && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>· {form.customer.gstin}</span>}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Walk-In / New customer form */
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, marginBottom: 12 }}>
              {[
                { key: "name",        label: "Name *",       type: "text" },
                { key: "mobile",      label: "Mobile *",     type: "tel" },
                { key: "email",       label: "Email",        type: "email" },
                { key: "companyName", label: "Company",      type: "text" },
                { key: "gstin",       label: "GSTIN",        type: "text" }
              ].map(({ key, label, type }) => (
                <label key={key} style={labelStyle}>
                  <span style={labelTextStyle}>{label}</span>
                  <input type={type} value={form.customer[key]}
                    onChange={e => setCustomerField(key, e.target.value)}
                    style={inputStyle} />
                </label>
              ))}
              <label style={labelStyle}>
                <span style={labelTextStyle}>Customer Type</span>
                <select value={form.customer.customerType} onChange={e => setCustomerField("customerType", e.target.value)}
                  style={inputStyle}>
                  <option value="retail">Retail</option>
                  <option value="dealer">Dealer</option>
                  <option value="stockist">Stockist</option>
                  <option value="distributor">Distributor</option>
                  <option value="institutional">Institutional</option>
                  <option value="project">Project</option>
                </select>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
              <input value={form.customer.addressLine1} onChange={e => setCustomerField("addressLine1", e.target.value)}
                placeholder="Address" style={inputStyle} />
              <input value={form.customer.city} onChange={e => setCustomerField("city", e.target.value)}
                placeholder="City" style={inputStyle} />
              <input value={form.customer.state} onChange={e => setCustomerField("state", e.target.value)}
                placeholder="State" style={inputStyle} />
              <input value={form.customer.pincode} onChange={e => setCustomerField("pincode", e.target.value)}
                placeholder="Pincode" style={inputStyle} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button type="button" className="btn btn-secondary btn-small" onClick={handleSaveCustomer} disabled={savingCustomer}>
                {savingCustomer ? "Saving…" : "Save Customer"}
              </button>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                Save these details now so you don't need to re-enter them if this order isn't confirmed today.
              </span>
              {customerSaveNotice && (
                <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{customerSaveNotice}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Products Card ───────────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Select Product</h3>

        {/* Product search bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, position: "relative" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={productQuery}
              onChange={e => onProductQueryChange(e.target.value)}
              onFocus={() => productResults.length > 0 && setProductDropOpen(true)}
              onBlur={() => setTimeout(() => setProductDropOpen(false), 150)}
              placeholder="Type to search products by name, SKU, brand..."
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            style={{ padding: "8px 10px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)", minWidth: 140 }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Product dropdown */}
          {productDropOpen && productResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.14)", marginTop: 4, maxHeight: 300, overflowY: "auto"
            }}>
              {productResults.map(p => (
                <button key={p.id} type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addProduct(p)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "10px 14px", background: "none", border: "none",
                    borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {[p.sku, p.categoryName || "Uncategorized", `GST ${p.gstRate}%`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--brand)" }}>
                      {formatCurrencyInr(p.salePrice || p.basePrice)}
                    </div>
                    {p.stockQty !== undefined && (
                      <div style={{ fontSize: 11, color: p.stockQty > 0 ? "#16a34a" : "#dc2626" }}>
                        Stock: {p.stockQty}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items */}
        {form.items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0", fontSize: 13, color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>
            Search and click a product above to add it
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                  {["Product", "Qty", "Price Mode", "Unit Price", "Disc %", "GST", "Line Total", ""].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 3 ? "right" : i === 0 ? "left" : "center", fontWeight: 700, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.items.map(line => {
                  const product = productCache[line.productId];
                  const preview = buildLinePreview(product, line);
                  return (
                    <tr key={line.productId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 10px" }}>
                        <div style={{ fontWeight: 600 }}>{product?.title || line.productId}</div>
                        {product?.sku && <div style={{ fontSize: 11, color: "var(--muted)" }}>{product.sku}</div>}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center" }}>
                        <input type="number" min="1" value={line.qty}
                          onChange={e => updateLine(line.productId, { qty: Math.max(1, Number(e.target.value || 1)) })}
                          style={{ width: 56, padding: "5px 6px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, textAlign: "center" }} />
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center" }}>
                        <select value={line.priceMode}
                          onChange={e => updateLine(line.productId, { priceMode: e.target.value })}
                          style={{ padding: "5px 6px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)" }}>
                          <option value="retail">Retail</option>
                          <option value="dealer">Dealer</option>
                          <option value="stockist">Stockist</option>
                          <option value="custom">Custom</option>
                        </select>
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right" }}>
                        {line.priceMode === "custom" ? (
                          <input type="number" min="0" step="0.01" value={line.customUnitPrice}
                            onChange={e => updateLine(line.productId, { customUnitPrice: e.target.value })}
                            style={{ width: 80, padding: "5px 6px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, textAlign: "right" }} />
                        ) : (
                          <span style={{ fontWeight: 600 }}>{formatCurrencyInr(preview.unitPrice)}</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right" }}>
                        <input type="number" min="0" max="100" step="0.01" value={line.discountPercent}
                          onChange={e => updateLine(line.productId, { discountPercent: Math.min(100, Math.max(0, Number(e.target.value || 0))) })}
                          style={{ width: 60, padding: "5px 6px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, textAlign: "right" }} />
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--muted)" }}>
                        {formatCurrencyInr(preview.gstAmount)}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700 }}>
                        {formatCurrencyInr(preview.lineTotal)}
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "center" }}>
                        <button type="button" onClick={() => removeLine(line.productId)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 18, lineHeight: 1, padding: "2px 6px" }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Order Options Card ──────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Order Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Shipping Method</span>
            <select value={form.shippingMethod} onChange={e => setForm(f => ({ ...f, shippingMethod: e.target.value }))}
              style={inputStyle}>
              <option value="self_pickup">Self Pickup</option>
              <option value="standard">Standard</option>
              <option value="express">Express</option>
              <option value="transport">Transport</option>
              <option value="manual_delivery">Manual Delivery</option>
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Shipping Charge</span>
            <input type="number" min="0" step="0.01"
              value={form.shippingMethod === "self_pickup" ? 0 : form.shippingCharge}
              onChange={e => setForm(f => ({ ...f, shippingCharge: e.target.value }))}
              disabled={form.shippingMethod === "self_pickup"}
              style={{ ...inputStyle, opacity: form.shippingMethod === "self_pickup" ? 0.5 : 1 }} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Payment Method</span>
            <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
              style={inputStyle}>
              <option value="cash">Cash</option>
              <option value="direct_bank_transfer">Bank Transfer</option>
              <option value="manual_upi">Manual UPI</option>
              <option value="cheque">Cheque</option>
              <option value="online_payment_link">Online Payment Link</option>
              <option value="credit_pay_later">Credit / Pay Later</option>
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Payment Reference</span>
            <input value={form.paymentReference} onChange={e => setForm(f => ({ ...f, paymentReference: e.target.value }))}
              placeholder="UPI ref, cheque no..."
              style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span style={labelTextStyle}>Order Note</span>
            <textarea value={form.orderNote} onChange={e => setForm(f => ({ ...f, orderNote: e.target.value }))}
              rows={2} placeholder="Internal note..."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </label>
          {isEditMode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={labelTextStyle}>Payment &amp; Invoice</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Saved changes regenerate the Proforma Invoice automatically if one already exists. Use "Confirm Payment" from the order list to mark this order paid.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={labelTextStyle}>Payment &amp; Invoice</span>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.markAsPaid}
                  onChange={e => setForm(f => ({ ...f, markAsPaid: e.target.checked }))} />
                Mark payment as received
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: form.markAsPaid ? "pointer" : "not-allowed", opacity: form.markAsPaid ? 1 : 0.45 }}>
                <input type="checkbox" checked={form.generateInvoice}
                  disabled={!form.markAsPaid}
                  onChange={e => setForm(f => ({ ...f, generateInvoice: e.target.checked }))} />
                Generate invoice now
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary + Actions ───────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {[
            { label: "Items",       value: String(summary.itemCount),                     color: "var(--text)" },
            ...(summary.discountTotal > 0 ? [{ label: "Discount", value: "-" + formatCurrencyInr(summary.discountTotal), color: "#16a34a" }] : []),
            { label: "Taxable",     value: formatCurrencyInr(summary.taxableValue),        color: "var(--text)" },
            { label: "GST",         value: formatCurrencyInr(summary.gstTotal),            color: "var(--text)" },
            { label: "Grand Total", value: formatCurrencyInr(summary.grandTotal),          color: "var(--brand)" }
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: s.label === "Grand Total" ? 20 : 17, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/walk-in-orders")} disabled={saving}>Cancel</button>
          {isEditMode ? (
            <button type="button" className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => submit(true)} disabled={saving}>
                {saving ? "Saving…" : "Save as Draft"}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
                {saving ? "Saving…" : "Save as Order"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
