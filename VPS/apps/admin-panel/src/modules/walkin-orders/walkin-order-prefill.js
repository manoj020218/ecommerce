// Builds the "Repeat Order" prefill for AddWalkInOrderPage from an existing
// order's detail (fetchOrderDetail) plus freshly fetched product records.
// Kept separate from the page (already ~1000 lines) and deliberately does
// NOT reuse/alter the Edit flow's loader -- repeat always creates a brand
// new order, edit updates in place.
//
// Price rule (user decision 2026-09-24): every line carries over the unit
// price the customer paid last time, as an editable "custom" price, with a
// one-click way back to today's price for that line.

function roundMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// order detail's unitPriceUsed is taxableValue / qty, i.e. AFTER the manual
// line discount. Carrying that over together with discountPercent would
// discount twice, so recover the pre-discount unit price instead.
export function resolveLastGrossUnitPrice(item) {
  const qty = Number(item.qty || 0);
  if (qty <= 0) return 0;
  const gross = Number(item.taxableValue || 0) + Number(item.discountAmount || 0);
  if (gross > 0) return roundMoney(gross / qty);
  return roundMoney(item.unitPriceUsed);
}

function resolveAvailableStock(product) {
  if (product?.stockQty === undefined || product?.stockQty === null) return null;
  return Number(product.stockQty || 0) - Number(product.reservedQty || 0);
}

// detail: order detail from fetchOrderDetail
// productsById: { [productId]: full product record | null (fetch failed) }
// Returns { form, lineNotes, skipped, customerMode }
export function buildRepeatOrderPrefill(detail, productsById, emptyForm) {
  const billing = detail.billingAddress || {};
  const lineNotes = {};
  const skipped = [];
  const items = [];

  (detail.items || []).forEach(item => {
    const product = productsById[item.productId];
    if (!product || product.isActive === false) {
      skipped.push({
        productId: item.productId,
        title: item.title || item.productId,
        reason: product ? "product is inactive" : "product no longer exists"
      });
      return;
    }
    if (items.some(line => line.productId === item.productId)) return;

    const qty = Math.max(1, Number(item.qty || 1));
    const lastUnitPrice = resolveLastGrossUnitPrice(item);
    const available = resolveAvailableStock(product);
    lineNotes[item.productId] = {
      lastPriceMode: item.selectedPriceMode || "retail",
      lastUnitPrice,
      lastQty: qty,
      availableStock: available,
      lowStock: available !== null && available < qty
    };
    items.push({
      productId: item.productId,
      qty,
      priceMode: "custom",
      customUnitPrice: lastUnitPrice,
      discountPercent: Number(item.discountPercent || 0)
    });
  });

  const form = {
    ...emptyForm,
    customerId: detail.ownerId || "",
    customer: {
      ...emptyForm.customer,
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
    items,
    shippingMethod: detail.shippingMethod || "self_pickup",
    shippingCharge: detail.pricing?.shippingCharge || 0,
    paymentMethod: detail.paymentMethod || "cash",
    // Fresh order: never pre-marked paid, no old txn ref, no old note.
    markAsPaid: false,
    generateInvoice: true,
    paymentReference: "",
    orderNote: ""
  };

  return {
    form,
    lineNotes,
    skipped,
    // Linked customer -> show the selected-customer pill; otherwise open
    // the editable Walk-In form pre-filled so it can be saved this time.
    customerMode: detail.ownerId ? "search" : "new"
  };
}
