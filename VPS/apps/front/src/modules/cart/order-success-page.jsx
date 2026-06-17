import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { submitManualPaymentProof } from "../account/account.api";
import {
  canSubmitManualPaymentProof,
  downloadInvoicePayload,
  formatAddress,
  formatCurrency,
  formatDate,
  getSupportWhatsappLink,
  humanizeStatus
} from "../account/account.utils";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { usePublicSettings } from "../settings/public-settings-context";
import {
  createPaymentAttempt,
  downloadCheckoutInvoice,
  getCheckoutOrderFollowup
} from "../products/products.api";
import { getExistingGuestSessionId } from "./cart.utils";
import {
  StorefrontAlert,
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontFileInput,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontSectionHeader,
  StorefrontStickyActionBar,
  StorefrontTextArea
} from "../../shared/storefront/storefront-ui";

function humanizeInstructionKey(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "paid" ||
    normalized === "delivered" ||
    normalized === "verified" ||
    normalized === "success" ||
    normalized === "completed"
  ) {
    return "success";
  }

  if (
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "expired" ||
    normalized === "rejected"
  ) {
    return "danger";
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("awaiting") ||
    normalized === "quote_required" ||
    normalized === "payment_attempt_created"
  ) {
    return "warning";
  }

  return "info";
}

function resolveHeadline(order, session) {
  const paymentMethod = order?.paymentMethod || session?.paymentMethod || "";
  const paymentStatus = order?.paymentStatus || session?.status || "";
  const orderStatus = order?.orderStatus || "";

  if (orderStatus === "awaiting_admin_approval") {
    return "Order request received";
  }

  if (paymentMethod === "online" && paymentStatus !== "paid") {
    return "Order placed, payment pending";
  }

  if (paymentStatus === "paid") {
    return "Payment received";
  }

  return "Order placed";
}

function resolveNextStep({ order, session, hasManualInstructions, pickupAddress }) {
  const paymentMethod = order?.paymentMethod || session?.paymentMethod || "";
  const paymentStatus = order?.paymentStatus || session?.status || "";
  const orderStatus = order?.orderStatus || "";
  const shippingMethod = order?.shippingMethod || session?.shippingMethod || "";
  const manualPaymentStatus = order?.manualPaymentStatus || "";
  const expectedDelivery = order?.trackingDetails?.expectedDeliveryDate || "";

  if (expectedDelivery) {
    return `Expected delivery: ${expectedDelivery}.`;
  }

  if (orderStatus === "awaiting_admin_approval") {
    return "Your order request is waiting for admin approval before payment collection or dispatch can begin.";
  }

  if (paymentMethod === "online" && paymentStatus !== "paid") {
    return "Complete the payment link to confirm the order. Dispatch starts after payment capture.";
  }

  if (
    (paymentMethod === "direct_bank_transfer" || paymentMethod === "manual_upi") &&
    hasManualInstructions &&
    manualPaymentStatus !== "verified"
  ) {
    return "Transfer the amount using the instructions below, then upload proof so the team can verify payment and release dispatch.";
  }

  if (shippingMethod === "self_pickup" || shippingMethod === "local_pickup") {
    return pickupAddress
      ? `Pickup will be coordinated by the store team from ${pickupAddress}.`
      : "Pickup timing will be shared by the store team after confirmation.";
  }

  if (shippingMethod === "express") {
    return "Priority dispatch is scheduled after payment confirmation.";
  }

  if (shippingMethod === "transport") {
    return "Transport booking will be coordinated after payment confirmation.";
  }

  return "Dispatch will begin after payment confirmation and order verification.";
}

function buildCheckoutAccessParams(isAuthenticated) {
  const guestSessionId = getExistingGuestSessionId();
  return isAuthenticated ? {} : { sessionId: guestSessionId || "" };
}

export function OrderSuccessPage() {
  const { checkoutSessionId: routeCheckoutSessionId = "" } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useCustomerSession();
  const { settings: publicSettings } = usePublicSettings();
  const [checkoutSession, setCheckoutSession] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [manualPaymentBusy, setManualPaymentBusy] = useState(false);
  const [paymentLink, setPaymentLink] = useState(() => {
    return (
      searchParams.get("paymentLink") ||
      location.state?.paymentAttempt?.gatewayPaymentLink ||
      ""
    );
  });
  const [manualInstructions, setManualInstructions] = useState(() => {
    return location.state?.manualPaymentInstructions?.instructions || null;
  });
  const [manualPaymentForm, setManualPaymentForm] = useState({
    utrNumber: "",
    note: "",
    file: null
  });

  const isFollowupMode = Boolean(routeCheckoutSessionId);
  const sessionId = routeCheckoutSessionId || searchParams.get("session") || "";
  const orderIdParam = searchParams.get("orderId") || "";
  const orderNoParam = searchParams.get("orderNo") || "";

  async function loadSuccessState(options = {}) {
    const { showSpinner = true, isActive = () => true } = options;

    if (!sessionId) {
      if (isActive()) {
        setError("Checkout session is missing. Restart checkout from the cart.");
        setLoading(false);
      }
      return;
    }

    if (showSpinner && isActive()) {
      setLoading(true);
    }
    if (isActive()) {
      setError("");
    }

    try {
      const followup = await getCheckoutOrderFollowup(
        sessionId,
        buildCheckoutAccessParams(isAuthenticated)
      );

      if (!isActive()) {
        return;
      }

      setCheckoutSession(followup?.checkoutSession || null);
      setOrder(followup?.order || null);
      setManualInstructions(
        followup?.order?.manualPaymentInstructions?.instructions ||
          location.state?.manualPaymentInstructions?.instructions ||
          null
      );
    } catch (requestError) {
      if (isActive()) {
        setError(requestError.message || "Order confirmation could not be loaded.");
      }
    } finally {
      if (showSpinner && isActive()) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let active = true;

    loadSuccessState({
      isActive: () => active
    });

    return () => {
      active = false;
    };
  }, [isAuthenticated, sessionId]);

  const supportPhone =
    publicSettings.contactInformation.publicPhone ||
    publicSettings.storeProfile.supportMobile ||
    "";
  const supportWhatsApp =
    publicSettings.contactInformation.publicWhatsApp ||
    publicSettings.storeProfile.whatsappNumber ||
    "";
  const pickupAddress =
    publicSettings.storeProfile.pickupAddress ||
    publicSettings.contactInformation.publicAddress ||
    "";
  const effectiveOrderId = order?.id || orderIdParam || checkoutSession?.orderId || "";
  const effectiveOrderNo =
    order?.orderNo ||
    location.state?.orderSummary?.orderNo ||
    orderNoParam ||
    effectiveOrderId ||
    sessionId;
  const items = useMemo(
    () => (Array.isArray(order?.items) ? order.items : checkoutSession?.cart?.items || []),
    [checkoutSession?.cart?.items, order?.items]
  );
  const total =
    order?.orderTotal ||
    order?.pricing?.grandTotal ||
    checkoutSession?.cart?.pricing?.grandTotal ||
    0;
  const paymentStatus = order?.paymentStatus || checkoutSession?.status || "pending";
  const orderStatus = order?.orderStatus || checkoutSession?.status || "started";
  const shipmentStatus = order?.shipmentStatus || "pending_packing";
  const paymentMethod = order?.paymentMethod || checkoutSession?.paymentMethod || "";
  const shippingMethod = order?.shippingMethod || checkoutSession?.shippingMethod || "";
  const headline = resolveHeadline(order, checkoutSession);
  const manualInstructionEntries = Object.entries(manualInstructions || {}).filter(([, value]) =>
    Boolean(value)
  );
  const canSubmitManualPayment = canSubmitManualPaymentProof(order);
  const nextStepCopy = resolveNextStep({
    order,
    session: checkoutSession,
    hasManualInstructions: manualInstructionEntries.length > 0,
    pickupAddress
  });
  const whatsappLink = getSupportWhatsappLink(
    supportWhatsApp,
    `Need help with order ${effectiveOrderNo || sessionId}.`
  );
  const guestOrderLink = checkoutSession?.id ? `/orders/guest/${checkoutSession.id}` : "";
  const showGuestFollowupLink =
    !isAuthenticated && Boolean(order) && Boolean(guestOrderLink) && !isFollowupMode;

  async function handleCreatePaymentLink() {
    if (!checkoutSession?.id) {
      return;
    }

    setPaymentBusy(true);
    setError("");
    setNotice("");

    try {
      const attempt = await createPaymentAttempt({
        ...buildCheckoutAccessParams(isAuthenticated),
        checkoutSessionId: checkoutSession.id
      });
      setPaymentLink(attempt?.gatewayPaymentLink || "");
      setNotice("Payment link created. Continue to complete payment.");
    } catch (requestError) {
      setError(requestError.message || "Payment link could not be created.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function handleDownloadInvoice() {
    if (!checkoutSession?.id || !order?.invoice?.id) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const payload = await downloadCheckoutInvoice(
        checkoutSession.id,
        buildCheckoutAccessParams(isAuthenticated)
      );
      downloadInvoicePayload(payload);
      setNotice("Invoice download prepared.");
    } catch (requestError) {
      setError(requestError.message || "Invoice download failed.");
    }
  }

  async function handleManualPaymentSubmit(event) {
    event.preventDefault();

    if (!order?.id) {
      setError("Order detail is still loading. Refresh and try again.");
      return;
    }

    if (!manualPaymentForm.file) {
      setError("Payment screenshot is required.");
      return;
    }

    const accessParams = buildCheckoutAccessParams(isAuthenticated);
    if (!isAuthenticated && !accessParams.sessionId) {
      setError(
        "Guest order access is missing in this browser. Use the original checkout browser or sign in and link the order."
      );
      return;
    }

    setManualPaymentBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      if (accessParams.sessionId) {
        formData.append("sessionId", accessParams.sessionId);
      }
      formData.append("orderId", order.id);
      formData.append("paymentMethod", order.paymentMethod || "direct_bank_transfer");
      formData.append("utrNumber", manualPaymentForm.utrNumber);
      formData.append("note", manualPaymentForm.note);
      formData.append("file", manualPaymentForm.file);

      await submitManualPaymentProof(formData);
      setManualPaymentForm({
        utrNumber: "",
        note: "",
        file: null
      });
      setNotice("Payment proof submitted for admin verification.");
      await loadSuccessState({ showSpinner: false });
    } catch (requestError) {
      setError(requestError.message || "Payment proof submission failed.");
    } finally {
      setManualPaymentBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading order confirmation..." />
      </main>
    );
  }

  return (
    <main className="proto-main-shell proto-checkout-page">
      <StorefrontPageHeader
        eyebrow={isFollowupMode ? "Guest Order Follow-Up" : "Order Confirmation"}
        title={headline}
        description={
          effectiveOrderNo
            ? `Reference ${effectiveOrderNo}. Keep this number for payment, support, and invoice follow-up.`
            : "Your checkout record has been created."
        }
      />

      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}

      <div className="proto-checkout-layout">
        <section className="proto-checkout-main">
          <StorefrontCard className="proto-checkout-card">
            <StorefrontSectionHeader
              title="Order Snapshot"
              description="Core order, payment, and dispatch details captured from the checkout session."
            />
            <div className="proto-feature-chip-row">
              <StorefrontBadge tone={statusTone(paymentStatus)}>
                Payment: {humanizeStatus(paymentStatus)}
              </StorefrontBadge>
              <StorefrontBadge tone={statusTone(orderStatus)}>
                Order: {humanizeStatus(orderStatus)}
              </StorefrontBadge>
              <StorefrontBadge tone={statusTone(shipmentStatus)}>
                Shipment: {humanizeStatus(shipmentStatus)}
              </StorefrontBadge>
            </div>
            <div className="proto-summary-rows">
              <div>
                <span>Order Number</span>
                <strong>{effectiveOrderNo || "--"}</strong>
              </div>
              <div>
                <span>Checkout Session</span>
                <strong>{checkoutSession?.id || "--"}</strong>
              </div>
              <div>
                <span>Created On</span>
                <strong>{formatDate(order?.orderDate || checkoutSession?.createdAt)}</strong>
              </div>
              <div>
                <span>Payment Method</span>
                <strong>{humanizeStatus(paymentMethod)}</strong>
              </div>
              <div>
                <span>Shipping Method</span>
                <strong>{humanizeStatus(shippingMethod)}</strong>
              </div>
              <div>
                <span>Grand Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
            </div>
            <StorefrontAlert tone="warning">{nextStepCopy}</StorefrontAlert>
            {!isAuthenticated && guestOrderLink ? (
              <StorefrontAlert>
                Keep this guest order link on the same browser for payment proof, invoice
                download, and support follow-up. You can also sign in later and link the
                order from your account using the same contact details.
              </StorefrontAlert>
            ) : null}
          </StorefrontCard>

          {manualInstructionEntries.length > 0 || canSubmitManualPayment ? (
            <StorefrontCard className="proto-checkout-card">
              <StorefrontSectionHeader
                title="Payment Instructions"
                description="Use these details if this order requires manual bank transfer or UPI verification."
              />
              {manualInstructionEntries.length > 0 ? (
                <div className="proto-summary-rows proto-summary-rows-compact">
                  {manualInstructionEntries.map(([key, value]) => (
                    <div key={key}>
                      <span>{humanizeInstructionKey(key)}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <StorefrontAlert tone="warning">
                  Manual payment details are not available on this order yet. Contact
                  support before transferring funds.
                </StorefrontAlert>
              )}

              {canSubmitManualPayment ? (
                <form
                  id="guest-manual-payment-form"
                  className="stack-form"
                  onSubmit={handleManualPaymentSubmit}
                >
                  <div className="field-grid">
                    <StorefrontInput
                      label="UTR / Reference Number"
                      value={manualPaymentForm.utrNumber}
                      onChange={(event) =>
                        setManualPaymentForm((current) => ({
                          ...current,
                          utrNumber: event.target.value
                        }))
                      }
                      required
                    />
                    <StorefrontFileInput
                      label="Payment Screenshot"
                      hint="Accepted formats: image or PDF proof."
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(event) =>
                        setManualPaymentForm((current) => ({
                          ...current,
                          file: event.target.files?.[0] || null
                        }))
                      }
                      required
                    />
                    <StorefrontTextArea
                      label="Note"
                      fieldClassName="field-span-2"
                      value={manualPaymentForm.note}
                      onChange={(event) =>
                        setManualPaymentForm((current) => ({
                          ...current,
                          note: event.target.value
                        }))
                      }
                      rows={3}
                      placeholder="Optional payment note"
                    />
                  </div>
                  <StorefrontButton type="submit" disabled={manualPaymentBusy}>
                    {manualPaymentBusy ? "Submitting..." : "Submit Payment Proof"}
                  </StorefrontButton>
                </form>
              ) : order?.manualPaymentStatus === "submitted" ? (
                <StorefrontAlert>
                  Payment proof has already been submitted and is waiting for admin
                  verification.
                </StorefrontAlert>
              ) : null}
            </StorefrontCard>
          ) : null}

          <StorefrontCard className="proto-checkout-card">
            <StorefrontSectionHeader
              title="Items"
              description={`${items.length} line item${items.length === 1 ? "" : "s"} in this checkout.`}
            />
            <div className="proto-checkout-items">
              {items.map((item) => (
                <div
                  key={`${item.productId || item.sku}-${item.title}`}
                  className="proto-checkout-item"
                >
                  <div className="proto-checkout-item-media">
                    <span>{item.sku || "Jenix"}</span>
                  </div>
                  <div className="proto-checkout-item-copy">
                    <p>{item.title}</p>
                    <span>
                      Qty {Number(item.qty || 0)} | {humanizeStatus(item.availabilityStatus)}
                    </span>
                    <strong>
                      {formatCurrency(
                        item.lineTotal || item.finalUnitPriceAfterDiscount || 0
                      )}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </StorefrontCard>

          <StorefrontCard className="proto-checkout-card">
            <StorefrontSectionHeader
              title="Addresses"
              description="Billing and shipping snapshots captured during checkout."
            />
            <div className="proto-summary-rows">
              <div>
                <span>Billing Address</span>
                <strong>
                  {formatAddress(order?.billingAddress || checkoutSession?.billingAddress || {}) ||
                    "--"}
                </strong>
              </div>
              <div>
                <span>Shipping Address</span>
                <strong>
                  {formatAddress(order?.shippingAddress || checkoutSession?.shippingAddress || {}) ||
                    "--"}
                </strong>
              </div>
            </div>
          </StorefrontCard>
        </section>

        <aside className="proto-checkout-sidebar">
          <StorefrontCard className="proto-order-summary-card">
            <StorefrontSectionHeader
              title="Next Actions"
              description="Use these actions to complete payment, track the order, or contact support."
            />
            <div className="proto-checkout-stack">
              {paymentMethod === "online" && paymentStatus !== "paid" ? (
                paymentLink ? (
                  <StorefrontButton href={paymentLink} target="_blank" rel="noreferrer">
                    Continue to Payment
                  </StorefrontButton>
                ) : (
                  <StorefrontButton
                    type="button"
                    onClick={handleCreatePaymentLink}
                    disabled={paymentBusy}
                  >
                    {paymentBusy ? "Creating Payment Link..." : "Create Payment Link"}
                  </StorefrontButton>
                )
              ) : null}

              {isAuthenticated && effectiveOrderId ? (
                <StorefrontButton to={`/account/orders/${effectiveOrderId}`} variant="light">
                  View Order
                </StorefrontButton>
              ) : null}

              {showGuestFollowupLink ? (
                <StorefrontButton to={guestOrderLink} variant="light">
                  View Order Status
                </StorefrontButton>
              ) : null}

              {order?.invoice?.id ? (
                <StorefrontButton
                  type="button"
                  variant="light"
                  onClick={handleDownloadInvoice}
                >
                  Download Invoice
                </StorefrontButton>
              ) : (
                <StorefrontAlert>
                  Invoice is generated after payment confirmation and order processing.
                  Revisit this order link or contact support if you need it urgently.
                </StorefrontAlert>
              )}

              <StorefrontButton to="/products" variant="dark">
                Continue Shopping
              </StorefrontButton>

              {supportPhone ? (
                <StorefrontButton href={`tel:${supportPhone}`} variant="light">
                  Call Support
                </StorefrontButton>
              ) : null}

              {whatsappLink ? (
                <StorefrontButton
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  variant="whatsapp"
                >
                  WhatsApp Support
                </StorefrontButton>
              ) : null}
            </div>
          </StorefrontCard>
        </aside>
      </div>

      <StorefrontStickyActionBar className="proto-sticky-success-bar">
        <div>
          <span>Order</span>
          <strong>{effectiveOrderNo || "Confirmation saved"}</strong>
        </div>
        {canSubmitManualPayment ? (
          <StorefrontButton
            type="submit"
            form="guest-manual-payment-form"
            disabled={manualPaymentBusy}
          >
            {manualPaymentBusy ? "Submitting..." : "Submit Proof"}
          </StorefrontButton>
        ) : paymentMethod === "online" && paymentStatus !== "paid" ? (
          paymentLink ? (
            <StorefrontButton href={paymentLink} target="_blank" rel="noreferrer">
              Continue Payment
            </StorefrontButton>
          ) : (
            <StorefrontButton
              type="button"
              onClick={handleCreatePaymentLink}
              disabled={paymentBusy}
            >
              {paymentBusy ? "Creating..." : "Create Payment Link"}
            </StorefrontButton>
          )
        ) : isAuthenticated && effectiveOrderId ? (
          <StorefrontButton to={`/account/orders/${effectiveOrderId}`}>
            View Order
          </StorefrontButton>
        ) : showGuestFollowupLink ? (
          <StorefrontButton to={guestOrderLink}>View Order Status</StorefrontButton>
        ) : order?.invoice?.id ? (
          <StorefrontButton type="button" onClick={handleDownloadInvoice}>
            Download Invoice
          </StorefrontButton>
        ) : (
          <StorefrontButton to="/products">Continue Shopping</StorefrontButton>
        )}
      </StorefrontStickyActionBar>
    </main>
  );
}
