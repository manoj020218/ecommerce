import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  fetchEmailTemplates,
  fetchNotificationLogs,
  previewEmailTemplate,
  updateEmailTemplate
} from "../marketing/marketing.api";

// Mirrors LIFECYCLE_NOTIFICATION_EVENTS in backend/src/modules/marketing/marketing.model.js —
// the 7 customer lifecycle events the storefront actually fires today, each with a
// matching "<key>_whatsapp" companion template. Keep in sync if that list changes.
const LIFECYCLE_EVENTS = [
  {
    key: "otp_login_code",
    whatsappKey: "otp_login_code_whatsapp",
    group: "Account",
    label: "Login OTP",
    description: "Sent when a customer requests a one-time code to log in by email."
  },
  {
    key: "forgot_password",
    whatsappKey: "forgot_password_whatsapp",
    group: "Account",
    label: "Forgot Password",
    description: "Sent when a customer requests a password reset link."
  },
  {
    key: "order_placed",
    whatsappKey: "order_placed_whatsapp",
    group: "Order",
    label: "Order Placed",
    description: "Sent the moment a customer's order is confirmed at checkout."
  },
  {
    key: "order_processing",
    whatsappKey: "order_processing_whatsapp",
    group: "Order",
    label: "Order Processed",
    description: "Sent when staff move an order to Processing in the fulfilment pipeline."
  },
  {
    key: "payment_pending",
    whatsappKey: "payment_pending_whatsapp",
    group: "Payment",
    label: "Payment Pending",
    description: "Sent after checkout for bank transfer / UPI orders that still need payment."
  },
  {
    key: "manual_payment_verified",
    whatsappKey: "manual_payment_verified_whatsapp",
    group: "Payment",
    label: "Payment Confirmed",
    description: "Sent when staff verify a manual bank transfer or UPI payment."
  },
  {
    key: "tracking_detail_update",
    whatsappKey: "tracking_detail_update_whatsapp",
    group: "Shipping",
    label: "Order Shipped",
    description: "Sent when tracking details are added or updated on a shipment."
  }
];

const GROUP_ORDER = ["Account", "Order", "Payment", "Shipping"];

const PREVIEW_VARIABLES = {
  customerName: "Preview Buyer",
  orderNo: "JNX-ORD-PREVIEW",
  invoiceNo: "JNX/2026-27/000001",
  orderTotal: "₹1,999",
  paymentMethod: "UPI",
  paymentInstructions: "A/C: 1234567890, IFSC: ABCD0123456",
  otpCode: "482913",
  resetPasswordUrl: "https://jenixindia.com/reset/preview",
  trackingId: "AWB-PREVIEW-001",
  trackingUrl: "https://tracking.example.com/AWB-PREVIEW-001",
  courierName: "Mock Courier",
  expectedDeliveryDate: "2 Aug 2026",
  businessName: "Jenix India",
  supportPhone: "+91-9999988888"
};

function findTemplate(templates, key) {
  return templates.find((template) => template.key === key) || null;
}

function findEventForTemplateKey(templateKey) {
  return LIFECYCLE_EVENTS.find(
    (event) => event.key === templateKey || event.whatsappKey === templateKey
  );
}

export function NotificationsPage() {
  const { session } = useAuthSession();
  const canEdit = hasPermission(session, "marketing.edit_templates");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [openEditorKey, setOpenEditorKey] = useState("");
  const [form, setForm] = useState({ subject: "", body: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const load = async () => {
    const [templatesData, logsData] = await Promise.all([
      fetchEmailTemplates(),
      fetchNotificationLogs({ limit: 100 })
    ]);
    setTemplates(Array.isArray(templatesData) ? templatesData : []);
    setLogs(Array.isArray(logsData) ? logsData : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      await load();
    } catch (apiError) {
      setError(apiError.message || "Failed to load customer notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const eventsByGroup = useMemo(() => {
    const map = new Map();
    for (const event of LIFECYCLE_EVENTS) {
      if (!map.has(event.group)) {
        map.set(event.group, []);
      }
      map.get(event.group).push(event);
    }
    return map;
  }, []);

  const lifecycleKeys = useMemo(
    () => LIFECYCLE_EVENTS.flatMap((event) => [event.key, event.whatsappKey]),
    []
  );

  const recentLogs = useMemo(
    () => logs.filter((log) => lifecycleKeys.includes(log.templateKey)).slice(0, 20),
    [logs, lifecycleKeys]
  );

  const openTemplateEditor = (templateKey) => {
    const template = findTemplate(templates, templateKey);
    if (!template) {
      return;
    }
    setOpenEditorKey(templateKey);
    setForm({
      subject: template.subject || "",
      body: template.body || "",
      isActive: Boolean(template.isActive)
    });
    setPreview(null);
    setError("");
  };

  const closeEditor = () => {
    setOpenEditorKey("");
    setForm({ subject: "", body: "", isActive: true });
    setPreview(null);
  };

  const onSave = async (event) => {
    event.preventDefault();
    if (!openEditorKey) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateEmailTemplate(openEditorKey, form);
      await load();
      setNotice("Message updated.");
      closeEditor();
    } catch (apiError) {
      setError(apiError.message || "Failed to save message.");
    } finally {
      setSaving(false);
    }
  };

  const onPreview = async () => {
    if (!openEditorKey) {
      return;
    }
    setPreviewing(true);
    setError("");
    try {
      const data = await previewEmailTemplate(openEditorKey, PREVIEW_VARIABLES);
      setPreview(data);
    } catch (apiError) {
      setError(apiError.message || "Failed to generate preview.");
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading customer notifications..." />;
  }

  if (error && templates.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  const editorTemplate = openEditorKey ? findTemplate(templates, openEditorKey) : null;
  const editorEvent = openEditorKey ? findEventForTemplateKey(openEditorKey) : null;
  const editorChannel = editorTemplate?.channel === "whatsapp" ? "WhatsApp" : "Email";

  return (
    <section className="stack">
      <PageHeader
        title="Notifications"
        description="What customers receive by email and WhatsApp at each step — login, order, payment, and shipping updates."
      />

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {GROUP_ORDER.map((groupName) => {
        const events = eventsByGroup.get(groupName) || [];
        if (events.length === 0) {
          return null;
        }

        return (
          <section key={groupName} className="summary-card">
            <div className="section-head">
              <div>
                <h3 className="subsection-title">{groupName}</h3>
              </div>
            </div>

            <div className="notification-event-grid">
              {events.map((event) => {
                const emailTemplate = findTemplate(templates, event.key);
                const whatsappTemplate = findTemplate(templates, event.whatsappKey);

                return (
                  <article key={event.key} className="card notification-event-card">
                    <div className="card-head">
                      <h4>{event.label}</h4>
                    </div>
                    <p className="muted">{event.description}</p>

                    <div className="notification-channel-row">
                      <div className="notification-channel">
                        <div className="notification-channel-head">
                          <span>Email</span>
                          <StatusBadge value={emailTemplate?.isActive ? "active" : "inactive"} />
                        </div>
                        <p className="row-sub">{emailTemplate?.subject || "No subject set"}</p>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => openTemplateEditor(event.key)}
                        >
                          {canEdit ? "Edit" : "View"}
                        </button>
                      </div>

                      <div className="notification-channel">
                        <div className="notification-channel-head">
                          <span>WhatsApp</span>
                          <StatusBadge value={whatsappTemplate?.isActive ? "active" : "inactive"} />
                        </div>
                        <p className="row-sub">
                          {whatsappTemplate?.body
                            ? `${whatsappTemplate.body.slice(0, 70)}${whatsappTemplate.body.length > 70 ? "..." : ""}`
                            : "No message set"}
                        </p>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => openTemplateEditor(event.whatsappKey)}
                        >
                          {canEdit ? "Edit" : "View"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Recent Deliveries</h3>
            <p className="muted">Latest email and WhatsApp sends for these customer events.</p>
          </div>
        </div>

        <div className="table-wrap desktop-only">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => {
                const event = findEventForTemplateKey(log.templateKey);
                return (
                  <tr key={log.id}>
                    <td>{event?.label || log.templateKey}</td>
                    <td>{log.channel === "whatsapp" ? "WhatsApp" : "Email"}</td>
                    <td>{log.toEmail || log.toMobile || "No recipient"}</td>
                    <td>
                      <StatusBadge value={log.status} />
                    </td>
                    <td>{formatDateTime(log.createdAt)}</td>
                  </tr>
                );
              })}
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="muted">
                    No deliveries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mobile-cards">
          {recentLogs.map((log) => {
            const event = findEventForTemplateKey(log.templateKey);
            return (
              <article key={log.id} className="card">
                <div className="card-head">
                  <h4>{event?.label || log.templateKey}</h4>
                  <StatusBadge value={log.status} />
                </div>
                <p className="muted">{log.channel === "whatsapp" ? "WhatsApp" : "Email"}</p>
                <p className="muted">{log.toEmail || log.toMobile || "No recipient"}</p>
                <p className="muted">{formatDateTime(log.createdAt)}</p>
              </article>
            );
          })}
          {recentLogs.length === 0 ? <p className="muted">No deliveries yet.</p> : null}
        </div>
      </section>

      <Modal
        title={editorEvent ? `${editorEvent.label} — ${editorChannel}` : "Edit message"}
        open={Boolean(openEditorKey)}
        onClose={closeEditor}
        width="720px"
        disableOutsideClick
      >
        <form className="form-grid" onSubmit={onSave}>
          {editorTemplate?.channel !== "whatsapp" ? (
            <label className="field field-full">
              <span>Subject</span>
              <input
                value={form.subject}
                onChange={(event) =>
                  setForm((current) => ({ ...current, subject: event.target.value }))
                }
                disabled={!canEdit}
              />
            </label>
          ) : null}
          <label className="field field-full">
            <span>Message</span>
            <textarea
              rows="8"
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({ ...current, body: event.target.value }))
              }
              disabled={!canEdit}
            />
          </label>
          <label className="inline-check field-full">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
              disabled={!canEdit}
            />
            <span>Send this message to customers</span>
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onPreview}
              disabled={previewing}
            >
              {previewing ? "Loading preview..." : "Preview with sample order"}
            </button>
            {canEdit ? (
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            ) : null}
          </div>

          {preview ? (
            <div className="template-preview field-full">
              {preview.subject ? <strong>{preview.subject}</strong> : null}
              <pre>{preview.body}</pre>
            </div>
          ) : null}
        </form>
      </Modal>
    </section>
  );
}
