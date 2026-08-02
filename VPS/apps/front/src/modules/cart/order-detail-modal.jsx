import { useEffect } from "react";
import { formatCurrency } from "./cart.utils";

// Shared invoice-style breakdown modal — used on both the checkout page
// (tapping the Grand Total in Review & Place) and the order-success page
// (tapping the order snapshot's total), so a buyer can always see exactly
// what they're paying for without hunting through a separate section.
export function OrderDetailModal({ open, onClose, items = [], pricing = {}, orderNo = "" }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  function unitPriceOf(item) {
    const value = item.unitPrice ?? item.finalUnitPrice ?? item.finalUnitPriceAfterDiscount ?? item.unitPriceUsed;
    if (value !== undefined && value !== null) {
      return Number(value);
    }
    const qty = Number(item.qty || 1);
    return qty > 0 ? Number(item.lineTotal || 0) / qty : 0;
  }

  return (
    <div className="proto-order-modal-overlay" onClick={onClose}>
      <div className="proto-order-modal" onClick={(event) => event.stopPropagation()}>
        <div className="proto-order-modal-head">
          <div>
            <h3>Order Details</h3>
            {orderNo ? <span>{orderNo}</span> : null}
          </div>
          <button type="button" className="proto-order-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18" /><path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="proto-order-modal-body">
          <table className="proto-order-modal-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.productId || item.id}>
                  <td>
                    <div className="proto-order-modal-item">
                      {item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" /> : null}
                      <span>{item.title}</span>
                    </div>
                  </td>
                  <td>{Number(item.qty || 0)}</td>
                  <td>{formatCurrency(unitPriceOf(item))}</td>
                  <td className="strong">{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="proto-order-modal-totals">
            <div><span>Product Total</span><strong>{formatCurrency(pricing.taxableValue ?? pricing.productSubtotal)}</strong></div>
            {Number(pricing.discountAmount || 0) > 0 ? (
              <div><span>Discount</span><strong>&minus; {formatCurrency(pricing.discountAmount)}</strong></div>
            ) : null}
            <div><span>Shipping</span><strong>{formatCurrency(pricing.shippingCharge)}</strong></div>
            <div><span>GST</span><strong>{formatCurrency(pricing.gstTotal)}</strong></div>
            <div className="proto-order-modal-grand">
              <span>Grand Total</span>
              <strong>{formatCurrency(pricing.grandTotal)}</strong>
            </div>
          </div>
          <p className="proto-order-modal-note">Prices shown are inclusive of all applicable taxes.</p>
        </div>
      </div>
    </div>
  );
}
