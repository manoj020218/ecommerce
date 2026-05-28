import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import {
  formatCurrencyInr,
  formatDateTime,
  splitCsvInput,
  toCsvInput
} from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  createOffer,
  fetchEmailTemplates,
  fetchMarketingOverview,
  fetchNotificationLogs,
  fetchNotifySubscriptions,
  fetchOffers,
  previewEmailTemplate,
  sendNotifySubscription,
  updateEmailTemplate,
  updateOffer
} from "./marketing.api";

const OFFER_TYPES = [
  "time_bound",
  "amount_based",
  "product_based",
  "category_based",
  "customer_type_based",
  "dealer_stockist_offer",
  "direct_payment_discount"
];

const EMPTY_OFFER_FORM = {
  name: "",
  type: "time_bound",
  description: "",
  couponCode: "",
  percentOff: "",
  amountOff: "",
  minOrderValue: "",
  customerType: "",
  productIds: "",
  categoryIds: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
  notes: ""
};

function toDateTimeLocal(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

function serializeOfferPayload(form) {
  return {
    name: form.name,
    type: form.type,
    description: form.description,
    couponCode: form.couponCode,
    percentOff: toNullableNumber(form.percentOff),
    amountOff: toNullableNumber(form.amountOff),
    minOrderValue: toNullableNumber(form.minOrderValue),
    customerType: form.customerType,
    productIds: splitCsvInput(form.productIds),
    categoryIds: splitCsvInput(form.categoryIds),
    startsAt: toIsoOrNull(form.startsAt),
    endsAt: toIsoOrNull(form.endsAt),
    isActive: Boolean(form.isActive),
    notes: form.notes
  };
}

function buildOfferForm(offer) {
  if (!offer) {
    return EMPTY_OFFER_FORM;
  }

  return {
    name: offer.name || "",
    type: offer.type || "time_bound",
    description: offer.description || "",
    couponCode: offer.couponCode || "",
    percentOff:
      offer.percentOff === null || offer.percentOff === undefined ? "" : String(offer.percentOff),
    amountOff:
      offer.amountOff === null || offer.amountOff === undefined ? "" : String(offer.amountOff),
    minOrderValue:
      offer.minOrderValue === null || offer.minOrderValue === undefined
        ? ""
        : String(offer.minOrderValue),
    customerType: offer.customerType || "",
    productIds: toCsvInput(offer.productIds),
    categoryIds: toCsvInput(offer.categoryIds),
    startsAt: toDateTimeLocal(offer.startsAt),
    endsAt: toDateTimeLocal(offer.endsAt),
    isActive: Boolean(offer.isActive),
    notes: offer.notes || ""
  };
}

export function MarketingPage() {
  const { session } = useAuthSession();
  const canEditOffers = hasPermission(session, "marketing.edit_offers");
  const canEditTemplates = hasPermission(session, "marketing.edit_templates");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState(null);
  const [offers, setOffers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notifySubscriptions, setNotifySubscriptions] = useState([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateForm, setTemplateForm] = useState({
    subject: "",
    body: "",
    isActive: true
  });
  const [preview, setPreview] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [logsFilter, setLogsFilter] = useState({
    templateKey: "",
    status: "",
    limit: 50
  });
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [offerForm, setOfferForm] = useState(EMPTY_OFFER_FORM);
  const [savingOffer, setSavingOffer] = useState(false);
  const [sendingNotifyId, setSendingNotifyId] = useState("");

  const loadAll = async () => {
    const [overviewData, offersData, templatesData, logsData, notifySubscriptionsData] = await Promise.all([
      fetchMarketingOverview(),
      fetchOffers({ includeInactive: true }),
      fetchEmailTemplates(),
      fetchNotificationLogs(logsFilter),
      fetchNotifySubscriptions({ limit: 12 })
    ]);

    setOverview(overviewData);
    setOffers(Array.isArray(offersData) ? offersData : []);
    setTemplates(Array.isArray(templatesData) ? templatesData : []);
    setLogs(Array.isArray(logsData) ? logsData : []);
    setNotifySubscriptions(
      Array.isArray(notifySubscriptionsData) ? notifySubscriptionsData : []
    );

    const initialTemplateKey =
      selectedTemplateKey || templatesData?.[0]?.key || "";
    if (initialTemplateKey) {
      const selected =
        templatesData.find((template) => template.key === initialTemplateKey) ||
        templatesData[0];
      setSelectedTemplateKey(selected.key);
      setTemplateForm({
        subject: selected.subject || "",
        body: selected.body || "",
        isActive: Boolean(selected.isActive)
      });
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadAll();
    } catch (apiError) {
      setError(apiError.message || "Failed to load marketing workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const onSelectTemplate = (templateKey) => {
    const selected = templates.find((template) => template.key === templateKey);
    if (!selected) {
      return;
    }

    setSelectedTemplateKey(templateKey);
    setTemplateForm({
      subject: selected.subject || "",
      body: selected.body || "",
      isActive: Boolean(selected.isActive)
    });
    setPreview(null);
  };

  const onSaveTemplate = async (event) => {
    event.preventDefault();
    setSavingTemplate(true);
    setError("");
    setNotice("");

    try {
      await updateEmailTemplate(selectedTemplateKey, templateForm);
      await loadAll();
      setNotice(`Template updated: ${selectedTemplateKey}`);
    } catch (apiError) {
      setError(apiError.message || "Failed to update email template.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const onPreviewTemplate = async () => {
    setError("");
    setNotice("");

    try {
      const data = await previewEmailTemplate(selectedTemplateKey, {
        customerName: "Preview Buyer",
        orderNo: "JNX-ORD-PREVIEW",
        invoiceNo: "JNX/2026-27/000001",
        trackingId: "AWB-PREVIEW-001",
        trackingUrl: "https://tracking.example.com/AWB-PREVIEW-001",
        courierName: "Mock Courier",
        paymentLink: "https://payments.example.com/pay/preview",
        supportPhone: "+91-9999988888",
        businessName: "Jenix India",
        cartItems: "Smart CCTV Camera x2"
      });
      setPreview(data);
    } catch (apiError) {
      setError(apiError.message || "Failed to preview email template.");
    }
  };

  const onRefreshLogs = async () => {
    setError("");

    try {
      const data = await fetchNotificationLogs(logsFilter);
      setLogs(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to refresh notification logs.");
    }
  };

  const openOfferModal = (offer = null) => {
    setEditingOffer(offer);
    setOfferForm(buildOfferForm(offer));
    setOfferModalOpen(true);
  };

  const closeOfferModal = () => {
    setOfferModalOpen(false);
    setEditingOffer(null);
    setOfferForm(EMPTY_OFFER_FORM);
    setSavingOffer(false);
  };

  const onSaveOffer = async (event) => {
    event.preventDefault();
    setSavingOffer(true);
    setError("");
    setNotice("");

    try {
      const payload = serializeOfferPayload(offerForm);
      if (editingOffer) {
        await updateOffer(editingOffer.id, payload);
        setNotice(`Offer updated: ${editingOffer.name}`);
      } else {
        await createOffer(payload);
        setNotice(`Offer created: ${offerForm.name}`);
      }
      await loadAll();
      closeOfferModal();
    } catch (apiError) {
      setError(apiError.message || "Failed to save offer.");
    } finally {
      setSavingOffer(false);
    }
  };

  const onSendNotifySubscription = async (subscription) => {
    setSendingNotifyId(subscription.id);
    setError("");
    setNotice("");

    try {
      const result = await sendNotifySubscription(subscription.id);
      await loadAll();
      setNotice(
        `Availability notification ${result?.subscription?.status === "notified" ? "sent" : "attempted"} for ${subscription.productTitle}`
      );
    } catch (apiError) {
      setError(apiError.message || "Failed to send availability notification.");
    } finally {
      setSendingNotifyId("");
    }
  };

  const customerSegments = Array.isArray(overview?.customerSegments?.segments)
    ? overview.customerSegments.segments
    : [];
  const notifySummary = overview?.notifyWhenAvailable || {};
  const recoverySummary = overview?.abandonedCartRecovery || {};

  if (loading) {
    return <LoadingBlock label="Loading marketing workspace..." />;
  }

  if (error && !overview) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Marketing"
        description="Phase 17 offers, templates, customer segments, recovery visibility, notify backlog, and channel/feed controls."
        actions={
          canEditOffers ? (
            <button type="button" className="btn btn-primary" onClick={() => openOfferModal()}>
              Create Offer
            </button>
          ) : null
        }
      />

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="summary-grid">
        <article className="summary-card">
          <p>Google Analytics</p>
          <h3>{overview?.analytics?.googleAnalyticsId || "Not set"}</h3>
          <span>Tag manager: {overview?.analytics?.googleTagManagerId || "Not set"}</span>
        </article>
        <article className="summary-card">
          <p>Customer Segments</p>
          <h3>{overview?.customerSegments?.totalCustomers || 0}</h3>
          <span>{customerSegments.length} generated audience groups</span>
        </article>
        <article className="summary-card">
          <p>Notify Backlog</p>
          <h3>{notifySummary.pendingCount || 0}</h3>
          <span>Ready to send: {notifySummary.readyToNotifyCount || 0}</span>
        </article>
        <article className="summary-card">
          <p>Abandoned Cart Recovery</p>
          <h3>{recoverySummary.dueReminders || 0}</h3>
          <span>Total tracked: {recoverySummary.total || 0}</span>
        </article>
      </div>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Customer Segments</h3>
            <p className="muted">Derived customer groups that can be targeted with templates, offers, and future channel campaigns.</p>
          </div>
        </div>

        <div className="table-wrap desktop-only">
          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Description</th>
                <th>Customers</th>
              </tr>
            </thead>
            <tbody>
              {customerSegments.map((segment) => (
                <tr key={segment.key}>
                  <td>
                    <strong>{segment.label}</strong>
                    <p className="row-sub">{segment.key}</p>
                  </td>
                  <td>{segment.description}</td>
                  <td>{segment.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-cards">
          {customerSegments.map((segment) => (
            <article key={segment.key} className="card">
              <div className="card-head">
                <h4>{segment.label}</h4>
                <strong>{segment.count}</strong>
              </div>
              <p className="muted">{segment.key}</p>
              <p className="muted">{segment.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Channels & Feeds</h3>
            <p className="muted">Operational references for WhatsApp chat, analytics tags, recovery reminders, and public product feeds.</p>
          </div>
        </div>

        <div className="summary-grid">
          <article className="summary-card">
            <p>WhatsApp Chat</p>
            <h3>{overview?.whatsappChat?.number || "Not set"}</h3>
            <span>{overview?.whatsappChat?.supportTiming || "Support timing not set"}</span>
          </article>
          <article className="summary-card">
            <p>Facebook Pixel</p>
            <h3>{overview?.analytics?.facebookPixelId || "Not set"}</h3>
            <span>{overview?.feeds?.facebookProductFeedUrl || "Feed URL unavailable"}</span>
          </article>
          <article className="summary-card">
            <p>Merchant Feed</p>
            <h3>{overview?.feeds?.merchantFeedUrl ? "Published" : "Not set"}</h3>
            <span>{overview?.feeds?.merchantFeedUrl || "Not set"}</span>
          </article>
          <article className="summary-card">
            <p>Notification Templates</p>
            <h3>{overview?.library?.activeTemplateCount || 0}</h3>
            <span>Total logs: {overview?.library?.notificationLogCount || 0}</span>
          </article>
          <article className="summary-card">
            <p>Facebook Product Feed</p>
            <h3>{overview?.feeds?.facebookProductFeedUrl ? "Published" : "Not set"}</h3>
            <span>{overview?.feeds?.facebookProductFeedUrl || "Not set"}</span>
          </article>
          <article className="summary-card">
            <p>Sitemap</p>
            <h3>{overview?.feeds?.sitemapEnabled ? "Enabled" : "Disabled"}</h3>
            <span>{overview?.feeds?.sitemapUrl || "Not set"}</span>
          </article>
          <article className="summary-card">
            <p>Abandoned Cart Recovery</p>
            <h3>{recoverySummary.byStage?.abandoned || 0} abandoned</h3>
            <span>
              Reminder schedule: {Array.isArray(recoverySummary.reminderScheduleMinutes)
                ? recoverySummary.reminderScheduleMinutes.join(" / ")
                : "--"} min
            </span>
          </article>
          <article className="summary-card">
            <p>Notify When Available</p>
            <h3>{notifySummary.totalCount || 0} requests</h3>
            <span>Sent: {notifySummary.notifiedCount || 0}</span>
          </article>
        </div>
      </section>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Offers</h3>
            <p className="muted">Commercial rules for campaigns, discounts, and customer-type promotions.</p>
          </div>
        </div>
        <div className="table-wrap desktop-only">
          <table>
            <thead>
              <tr>
                <th>Offer</th>
                <th>Type</th>
                <th>Discount</th>
                <th>Customer Type</th>
                <th>Window</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id}>
                  <td>
                    <strong>{offer.name}</strong>
                    <p className="row-sub">{offer.couponCode || "No coupon code"}</p>
                  </td>
                  <td>{offer.type}</td>
                  <td>
                    {offer.percentOff !== null ? `${offer.percentOff}% off` : null}
                    {offer.percentOff !== null && offer.amountOff !== null ? " / " : ""}
                    {offer.amountOff !== null ? formatCurrencyInr(offer.amountOff) : null}
                    {offer.percentOff === null && offer.amountOff === null ? "Rule only" : null}
                  </td>
                  <td>{offer.customerType || "all"}</td>
                  <td>
                    <p className="row-sub">{offer.startsAt ? formatDateTime(offer.startsAt) : "Open start"}</p>
                    <p className="row-sub">{offer.endsAt ? formatDateTime(offer.endsAt) : "Open end"}</p>
                  </td>
                  <td>
                    <StatusBadge value={offer.isActive ? "active" : "inactive"} />
                  </td>
                  <td className="row-actions">
                    {canEditOffers ? (
                      <button type="button" className="btn-link" onClick={() => openOfferModal(offer)}>
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

        <div className="mobile-cards">
          {offers.map((offer) => (
            <article key={offer.id} className="card">
              <div className="card-head">
                <h4>{offer.name}</h4>
                <StatusBadge value={offer.isActive ? "active" : "inactive"} />
              </div>
              <p className="muted">{offer.type}</p>
              <p className="muted">{offer.customerType || "all customers"}</p>
              <p className="muted">{offer.couponCode || "No coupon code"}</p>
              {canEditOffers ? (
                <div className="card-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => openOfferModal(offer)}>
                    Edit Offer
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Email Templates</h3>
            <p className="muted">Edit saved templates and preview variable replacement before sending.</p>
          </div>
        </div>
        <div className="two-column">
          <div className="template-list">
            {templates.map((template) => (
              <button
                key={template.key}
                type="button"
                className={`template-list-button${selectedTemplateKey === template.key ? " active" : ""}`}
                onClick={() => onSelectTemplate(template.key)}
              >
                <strong>{template.label}</strong>
                <span>{template.key}</span>
              </button>
            ))}
          </div>

          <form className="form-grid" onSubmit={onSaveTemplate}>
            <label className="field field-full">
              <span>Subject</span>
              <input
                value={templateForm.subject}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    subject: event.target.value
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>Body</span>
              <textarea
                rows="10"
                value={templateForm.body}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    body: event.target.value
                  }))
                }
              />
            </label>
            <label className="inline-check field-full">
              <input
                type="checkbox"
                checked={templateForm.isActive}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    isActive: event.target.checked
                  }))
                }
              />
              <span>Template active</span>
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={onPreviewTemplate}>
                Preview
              </button>
              {canEditTemplates ? (
                <button type="submit" className="btn btn-primary" disabled={savingTemplate}>
                  {savingTemplate ? "Saving..." : "Save Template"}
                </button>
              ) : null}
            </div>
            {preview ? (
              <div className="template-preview field-full">
                <strong>{preview.subject}</strong>
                <pre>{preview.body}</pre>
              </div>
            ) : null}
          </form>
        </div>
      </section>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Notify When Available</h3>
            <p className="muted">Customers can register for out-of-stock products, and notifications can be sent once the product is available again.</p>
          </div>
        </div>

        <div className="table-wrap desktop-only">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Availability</th>
                <th>Last Attempt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {notifySubscriptions.map((subscription) => (
                <tr key={subscription.id}>
                  <td>
                    <strong>{subscription.productTitle}</strong>
                    <p className="row-sub">{subscription.productSlug}</p>
                  </td>
                  <td>
                    <strong>{subscription.customerName || "Customer"}</strong>
                    <p className="row-sub">{subscription.email}</p>
                  </td>
                  <td>
                    <StatusBadge value={subscription.status} />
                  </td>
                  <td>
                    <StatusBadge value={subscription.productStatus} />
                    <p className="row-sub">
                      {subscription.productIsAvailable ? "Ready to notify" : "Still unavailable"}
                    </p>
                  </td>
                  <td>
                    <p className="row-sub">
                      {subscription.lastAttemptAt
                        ? formatDateTime(subscription.lastAttemptAt)
                        : "No attempt yet"}
                    </p>
                    <p className="row-sub">{subscription.lastAttemptStatus || "n/a"}</p>
                  </td>
                  <td className="row-actions">
                    {canEditTemplates &&
                    subscription.status === "pending" &&
                    subscription.productIsAvailable ? (
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => onSendNotifySubscription(subscription)}
                        disabled={sendingNotifyId === subscription.id}
                      >
                        {sendingNotifyId === subscription.id ? "Sending..." : "Send"}
                      </button>
                    ) : (
                      <span className="row-sub">No action</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-cards">
          {notifySubscriptions.map((subscription) => (
            <article key={subscription.id} className="card">
              <div className="card-head">
                <h4>{subscription.productTitle}</h4>
                <StatusBadge value={subscription.status} />
              </div>
              <p className="muted">{subscription.email}</p>
              <p className="muted">
                {subscription.productIsAvailable ? "Ready to notify" : "Still unavailable"}
              </p>
              <p className="muted">
                {subscription.lastAttemptStatus || "No delivery attempt yet"}
              </p>
              {canEditTemplates &&
              subscription.status === "pending" &&
              subscription.productIsAvailable ? (
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onSendNotifySubscription(subscription)}
                    disabled={sendingNotifyId === subscription.id}
                  >
                    {sendingNotifyId === subscription.id ? "Sending..." : "Send Notification"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Notification Logs</h3>
            <p className="muted">Simulated email sends recorded from order, payment, and tracking events.</p>
          </div>
        </div>

        <form className="form-grid wide" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>Template Key</span>
            <input
              value={logsFilter.templateKey}
              onChange={(event) =>
                setLogsFilter((current) => ({
                  ...current,
                  templateKey: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Status</span>
            <input
              value={logsFilter.status}
              onChange={(event) =>
                setLogsFilter((current) => ({
                  ...current,
                  status: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Limit</span>
            <input
              type="number"
              min="1"
              max="200"
              value={logsFilter.limit}
              onChange={(event) =>
                setLogsFilter((current) => ({
                  ...current,
                  limit: event.target.value
                }))
              }
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onRefreshLogs}>
              Refresh Logs
            </button>
          </div>
        </form>

        <div className="table-wrap desktop-only">
          <table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Resource</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <strong>{log.templateKey}</strong>
                    <p className="row-sub">{log.subject}</p>
                  </td>
                  <td>{log.toEmail || "No recipient"}</td>
                  <td>
                    <StatusBadge value={log.status} />
                  </td>
                  <td>
                    {log.relatedResourceType || "n/a"}
                    <p className="row-sub">{log.relatedResourceId || "n/a"}</p>
                  </td>
                  <td>{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-cards">
          {logs.map((log) => (
            <article key={log.id} className="card">
              <div className="card-head">
                <h4>{log.templateKey}</h4>
                <StatusBadge value={log.status} />
              </div>
              <p className="muted">{log.toEmail || "No recipient"}</p>
              <p className="muted">{log.relatedResourceType || "n/a"} / {log.relatedResourceId || "n/a"}</p>
              <p className="muted">{formatDateTime(log.createdAt)}</p>
            </article>
          ))}
        </div>
      </section>

      <Modal
        title={editingOffer ? `Edit Offer - ${editingOffer.name}` : "Create Offer"}
        open={offerModalOpen}
        onClose={closeOfferModal}
        width="900px"
      >
        <form className="form-grid wide" onSubmit={onSaveOffer}>
          <label className="field">
            <span>Name</span>
            <input
              value={offerForm.name}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              value={offerForm.type}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  type: event.target.value
                }))
              }
            >
              {OFFER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Coupon Code</span>
            <input
              value={offerForm.couponCode}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  couponCode: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Percent Off</span>
            <input
              type="number"
              value={offerForm.percentOff}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  percentOff: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Amount Off</span>
            <input
              type="number"
              value={offerForm.amountOff}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  amountOff: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Min Order Value</span>
            <input
              type="number"
              value={offerForm.minOrderValue}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  minOrderValue: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Customer Type</span>
            <input
              value={offerForm.customerType}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  customerType: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Starts At</span>
            <input
              type="datetime-local"
              value={offerForm.startsAt}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  startsAt: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Ends At</span>
            <input
              type="datetime-local"
              value={offerForm.endsAt}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  endsAt: event.target.value
                }))
              }
            />
          </label>
          <label className="field field-full">
            <span>Description</span>
            <textarea
              rows="4"
              value={offerForm.description}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
            />
          </label>
          <label className="field field-full">
            <span>Linked Product IDs</span>
            <input
              value={offerForm.productIds}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  productIds: event.target.value
                }))
              }
            />
          </label>
          <label className="field field-full">
            <span>Linked Category IDs</span>
            <input
              value={offerForm.categoryIds}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  categoryIds: event.target.value
                }))
              }
            />
          </label>
          <label className="field field-full">
            <span>Notes</span>
            <textarea
              rows="4"
              value={offerForm.notes}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  notes: event.target.value
                }))
              }
            />
          </label>
          <label className="inline-check field-full">
            <input
              type="checkbox"
              checked={offerForm.isActive}
              onChange={(event) =>
                setOfferForm((current) => ({
                  ...current,
                  isActive: event.target.checked
                }))
              }
            />
            <span>Offer active</span>
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeOfferModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingOffer}>
              {savingOffer ? "Saving..." : editingOffer ? "Save Offer" : "Create Offer"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
