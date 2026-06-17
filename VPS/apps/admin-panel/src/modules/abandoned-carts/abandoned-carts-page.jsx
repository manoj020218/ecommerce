import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import {
  formatCurrencyInr,
  formatDateTime,
  formatNumber
} from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  fetchAbandonedCartRecoveries,
  fetchAbandonedCartRecovery,
  fetchAbandonedCartSummary,
  runAbandonedCartReminders
} from "./abandoned-carts.api";

const DEFAULT_FILTERS = {
  stage: "",
  dueOnly: false,
  limit: 50
};

const STAGE_OPTIONS = [
  "active",
  "cart_added",
  "checkout_started",
  "payment_pending",
  "payment_failed",
  "abandoned",
  "recovered",
  "expired"
];

export function AbandonedCartsPage() {
  const { session } = useAuthSession();
  const canSendReminders = hasPermission(session, "marketing.edit_templates");

  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [summary, setSummary] = useState(null);
  const [recoveries, setRecoveries] = useState([]);
  const [selectedRecovery, setSelectedRecovery] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadAll = async (nextFilters = filters) => {
    setError("");
    const [summaryData, recoveriesData] = await Promise.all([
      fetchAbandonedCartSummary(),
      fetchAbandonedCartRecoveries(nextFilters)
    ]);

    setSummary(summaryData);
    setRecoveries(Array.isArray(recoveriesData) ? recoveriesData : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadAll(DEFAULT_FILTERS);
    } catch (apiError) {
      setError(apiError.message || "Failed to load abandoned cart workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setNotice("");

    try {
      await loadAll(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to load recoveries.");
    }
  };

  const openDetail = async (recoveryId) => {
    setBusyKey(`detail:${recoveryId}`);
    setError("");

    try {
      const data = await fetchAbandonedCartRecovery(recoveryId);
      setSelectedRecovery(data);
      setDetailOpen(true);
    } catch (apiError) {
      setError(apiError.message || "Failed to load recovery detail.");
    } finally {
      setBusyKey("");
    }
  };

  const onRunReminders = async () => {
    setBusyKey("reminders");
    setError("");
    setNotice("");

    try {
      const result = await runAbandonedCartReminders({});
      await loadAll(filters);
      setNotice(`Reminder run completed. Dispatched ${result.dispatchedCount || 0} reminders.`);
    } catch (apiError) {
      setError(apiError.message || "Failed to run reminder dispatch.");
    } finally {
      setBusyKey("");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading abandoned cart recovery..." />;
  }

  if (error && !summary) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Abandoned Carts"
        description="Dedicated recovery workspace for pending carts, reminder dispatch, and inspection of recovery activity."
        actions={
          canSendReminders ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRunReminders}
              disabled={busyKey === "reminders"}
            >
              {busyKey === "reminders" ? "Running..." : "Run Due Reminders"}
            </button>
          ) : null
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Total Recoveries</p>
          <h3>{formatNumber(summary?.total || 0)}</h3>
          <span>Tracked cart sessions</span>
        </article>
        <article className="summary-card">
          <p>Due Reminders</p>
          <h3>{formatNumber(summary?.dueReminders || 0)}</h3>
          <span>Ready for dispatch now</span>
        </article>
        <article className="summary-card">
          <p>Recovered</p>
          <h3>{formatNumber(summary?.byStage?.recovered || 0)}</h3>
          <span>Converted recovery sessions</span>
        </article>
        <article className="summary-card">
          <p>Abandoned</p>
          <h3>{formatNumber(summary?.byStage?.abandoned || 0)}</h3>
          <span>Sessions currently abandoned</span>
        </article>
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <form className="form-grid wide" onSubmit={onSubmit}>
          <label className="field">
            <span>Stage</span>
            <select
              value={filters.stage}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  stage: event.target.value
                }))
              }
            >
              <option value="">All stages</option>
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Limit</span>
            <input
              type="number"
              min="1"
              max="100"
              value={filters.limit}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  limit: event.target.value
                }))
              }
            />
          </label>
          <label className="inline-check field-full">
            <input
              type="checkbox"
              checked={Boolean(filters.dueOnly)}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  dueOnly: event.target.checked
                }))
              }
            />
            <span>Show due reminders only</span>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Apply Filters
            </button>
          </div>
        </form>
      </section>

      {recoveries.length === 0 ? (
        <EmptyBlock
          title="No recovery sessions matched the selected filters."
          description="Broaden the filters or wait for new cart activity."
        />
      ) : null}

      {recoveries.length > 0 ? (
        <>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Customer / Session</th>
                  <th>Stage</th>
                  <th>Cart</th>
                  <th>Reminder</th>
                  <th>Last Activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recoveries.map((recovery) => (
                  <tr key={recovery.id}>
                    <td>
                      <strong>{recovery.customerName || recovery.email || recovery.mobile || "Guest session"}</strong>
                      <p className="row-sub">{recovery.sessionId || recovery.ownerId}</p>
                    </td>
                    <td>
                      <StatusBadge value={recovery.stage} />
                    </td>
                    <td>
                      <strong>{formatCurrencyInr(recovery.cartValue || 0)}</strong>
                      <p className="row-sub">{formatNumber(recovery.cartItemCount || 0)} items</p>
                    </td>
                    <td>
                      <strong>{formatNumber(recovery.reminderCount || 0)} sent</strong>
                      <p className="row-sub">{formatDateTime(recovery.nextReminderAt)}</p>
                    </td>
                    <td>{formatDateTime(recovery.lastActivityAt)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => openDetail(recovery.id)}
                        disabled={busyKey === `detail:${recovery.id}`}
                      >
                        {busyKey === `detail:${recovery.id}` ? "Opening..." : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {recoveries.map((recovery) => (
              <article key={recovery.id} className="card">
                <div className="card-head">
                  <h4>{recovery.customerName || recovery.email || "Guest session"}</h4>
                  <StatusBadge value={recovery.stage} />
                </div>
                <p className="muted">{recovery.sessionId || recovery.ownerId}</p>
                <p className="muted">{formatCurrencyInr(recovery.cartValue || 0)}</p>
                <p className="muted">{formatDateTime(recovery.nextReminderAt)}</p>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openDetail(recovery.id)}
                    disabled={busyKey === `detail:${recovery.id}`}
                  >
                    View Detail
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      <Modal
        title={selectedRecovery?.id || "Recovery Detail"}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width="960px"
      >
        {selectedRecovery ? (
          <section className="stack">
            <div className="summary-grid">
              <article className="summary-card">
                <p>Stage</p>
                <h3>{selectedRecovery.stage}</h3>
                <span>{selectedRecovery.sessionId || selectedRecovery.ownerId}</span>
              </article>
              <article className="summary-card">
                <p>Cart Value</p>
                <h3>{formatCurrencyInr(selectedRecovery.cartValue || 0)}</h3>
                <span>{formatNumber(selectedRecovery.cartItemCount || 0)} items</span>
              </article>
              <article className="summary-card">
                <p>Recovery URL</p>
                <h3>{selectedRecovery.recoveryToken ? "Available" : "Unavailable"}</h3>
                <span>{selectedRecovery.recoveryUrl || "n/a"}</span>
              </article>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cart Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedRecovery.cartItems || []).map((item) => (
                    <tr key={`${item.productId}-${item.sku}`}>
                      <td>
                        <strong>{item.title}</strong>
                        <p className="row-sub">{item.sku || item.slug || item.productId}</p>
                      </td>
                      <td>{formatNumber(item.qty || 0)}</td>
                      <td>{formatCurrencyInr(item.unitPrice || 0)}</td>
                      <td>{formatCurrencyInr(item.lineTotal || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </Modal>
    </section>
  );
}
