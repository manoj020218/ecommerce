import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { StarRating } from "../../shared/components/star-rating";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  fetchReviews,
  fetchReview,
  moderateReview,
  deleteReview,
  fetchReviewSettings,
  updateReviewSettings
} from "./reviews.api";

const DEFAULT_SETTINGS = { eligibility: "logged_in", moderationMode: "gated" };

export function ReviewsPage() {
  const { session } = useAuthSession();
  const canModerate = hasPermission(session, "reviews.moderate");
  const canDelete = hasPermission(session, "reviews.delete");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reviews, setReviews] = useState([]);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [selectedReview, setSelectedReview] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadReviews = async (status = statusFilter) => {
    const data = await fetchReviews(status ? { status } : {});
    setReviews(Array.isArray(data) ? data : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      const [reviewsData, settingsData] = await Promise.all([
        fetchReviews(),
        fetchReviewSettings().catch(() => DEFAULT_SETTINGS)
      ]);
      setReviews(Array.isArray(reviewsData) ? reviewsData : []);
      setSettings({ ...DEFAULT_SETTINGS, ...settingsData });
    } catch (apiError) {
      setError(apiError.message || "Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const onFilterChange = async (nextStatus) => {
    setStatusFilter(nextStatus);
    setError("");
    try {
      await loadReviews(nextStatus);
    } catch (apiError) {
      setError(apiError.message || "Failed to filter reviews.");
    }
  };

  const onSaveSettings = async () => {
    setSettingsSaving(true);
    setError("");
    setNotice("");
    try {
      await updateReviewSettings(settings);
      setNotice("Review settings saved.");
    } catch (apiError) {
      setError(apiError.message || "Failed to save review settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const openView = async (reviewId) => {
    setBusyKey(`view:${reviewId}`);
    setError("");
    setRejecting(false);
    setRejectionReason("");

    try {
      const data = await fetchReview(reviewId);
      setSelectedReview(data);
      setViewModalOpen(true);
    } catch (apiError) {
      setError(apiError.message || "Failed to load review.");
    } finally {
      setBusyKey("");
    }
  };

  const closeView = () => {
    setViewModalOpen(false);
    setSelectedReview(null);
    setRejecting(false);
    setRejectionReason("");
  };

  const onApprove = async () => {
    if (!selectedReview) return;
    setBusyKey(`moderate:${selectedReview.id}`);
    setError("");
    try {
      await moderateReview(selectedReview.id, { action: "approve" });
      await loadReviews();
      setNotice("Review approved.");
      closeView();
    } catch (apiError) {
      setError(apiError.message || "Failed to approve review.");
    } finally {
      setBusyKey("");
    }
  };

  const onConfirmReject = async () => {
    if (!selectedReview) return;
    setBusyKey(`moderate:${selectedReview.id}`);
    setError("");
    try {
      await moderateReview(selectedReview.id, {
        action: "reject",
        rejectionReason
      });
      await loadReviews();
      setNotice("Review rejected.");
      closeView();
    } catch (apiError) {
      setError(apiError.message || "Failed to reject review.");
    } finally {
      setBusyKey("");
    }
  };

  const onDelete = async (reviewId) => {
    if (!window.confirm("Delete this review permanently?")) return;
    setBusyKey(`delete:${reviewId}`);
    setError("");
    setNotice("");
    try {
      await deleteReview(reviewId);
      await loadReviews();
      setNotice("Review deleted.");
    } catch (apiError) {
      setError(apiError.message || "Failed to delete review.");
    } finally {
      setBusyKey("");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading reviews..." />;
  }

  if (error && reviews.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Reviews & Ratings"
        description="Moderate buyer reviews and configure who can leave one."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Review Settings</h3>
            <p className="muted">Who can leave a review, and whether reviews need approval before going live.</p>
          </div>
        </div>
        <div className="form-grid wide">
          <label className="field">
            <span>Who can review</span>
            <select
              value={settings.eligibility}
              onChange={(event) =>
                setSettings((current) => ({ ...current, eligibility: event.target.value }))
              }
              disabled={!canModerate}
            >
              <option value="logged_in">Any logged-in customer</option>
              <option value="verified_purchase">Verified purchaser only</option>
            </select>
          </label>
          <label className="field">
            <span>Publishing</span>
            <select
              value={settings.moderationMode}
              onChange={(event) =>
                setSettings((current) => ({ ...current, moderationMode: event.target.value }))
              }
              disabled={!canModerate}
            >
              <option value="gated">Gated — admin must approve first</option>
              <option value="auto">Auto — publish immediately</option>
            </select>
          </label>
          {canModerate ? (
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSaveSettings}
                disabled={settingsSaving}
              >
                {settingsSaving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">All Reviews</h3>
          </div>
          <label className="field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => onFilterChange(event.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>

        {reviews.length === 0 ? (
          <EmptyBlock
            title="No reviews yet."
            description="Buyer-submitted reviews will show up here for moderation."
          />
        ) : (
          <>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Review Title</th>
                    <th>Review For</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id}>
                      <td>{formatDateTime(review.createdAt)}</td>
                      <td>{review.title}</td>
                      <td>{review.productTitle}</td>
                      <td>{review.customerName}</td>
                      <td>
                        <StatusBadge value={review.status} />
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => openView(review.id)}
                          disabled={busyKey === `view:${review.id}`}
                        >
                          {busyKey === `view:${review.id}` ? "Opening..." : "View"}
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => onDelete(review.id)}
                            disabled={busyKey === `delete:${review.id}`}
                          >
                            {busyKey === `delete:${review.id}` ? "Deleting..." : "Delete"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards">
              {reviews.map((review) => (
                <article key={review.id} className="card">
                  <div className="card-head">
                    <h4>{review.title}</h4>
                    <StatusBadge value={review.status} />
                  </div>
                  <p className="muted">{review.productTitle}</p>
                  <p className="muted">{review.customerName} — {formatDateTime(review.createdAt)}</p>
                  <div className="card-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => openView(review.id)}>
                      View Review
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <Modal title={selectedReview?.title || "Review"} open={viewModalOpen} onClose={closeView} width="640px">
        {selectedReview ? (
          <section className="stack">
            <div className="summary-grid">
              <article className="summary-card">
                <p>Product</p>
                <h3>{selectedReview.productTitle}</h3>
              </article>
              <article className="summary-card">
                <p>Customer</p>
                <h3>{selectedReview.customerName}</h3>
                <span>{formatDateTime(selectedReview.createdAt)}</span>
              </article>
              <article className="summary-card">
                <p>Rating</p>
                <h3><StarRating value={selectedReview.rating} /></h3>
                <span><StatusBadge value={selectedReview.status} /></span>
              </article>
            </div>

            <div className="field">
              <span>Comment</span>
              <p>{selectedReview.comment}</p>
            </div>

            {selectedReview.status === "rejected" && selectedReview.rejectionReason ? (
              <p className="muted">Rejection reason: {selectedReview.rejectionReason}</p>
            ) : null}

            {canModerate ? (
              rejecting ? (
                <div className="stack">
                  <label className="field">
                    <span>Rejection reason</span>
                    <textarea
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      rows={3}
                    />
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setRejecting(false)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={onConfirmReject}
                      disabled={busyKey === `moderate:${selectedReview.id}`}
                    >
                      {busyKey === `moderate:${selectedReview.id}` ? "Rejecting..." : "Confirm Reject"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeView}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setRejecting(true)}
                    disabled={busyKey === `moderate:${selectedReview.id}`}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onApprove}
                    disabled={busyKey === `moderate:${selectedReview.id}`}
                  >
                    {busyKey === `moderate:${selectedReview.id}` ? "Approving..." : "Approve"}
                  </button>
                </div>
              )
            ) : (
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeView}>
                  Close
                </button>
              </div>
            )}
          </section>
        ) : null}
      </Modal>
    </section>
  );
}
