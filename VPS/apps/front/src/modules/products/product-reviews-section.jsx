import { useEffect, useState } from "react";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontInput,
  StorefrontTextArea
} from "../../shared/storefront/storefront-ui";
import { StarRating } from "../../shared/storefront/star-rating";
import { getProductReviews, submitProductReview } from "./reviews.api";

const EMPTY_FORM = { rating: 0, title: "", comment: "" };

export function ProductReviewsSection({ productId }) {
  const { isAuthenticated } = useCustomerSession();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({ avgRating: 0, reviewCount: 0 });
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    getProductReviews(productId)
      .then((data) => {
        if (!active) return;
        setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
        setSummary(data?.summary || { avgRating: 0, reviewCount: 0 });
      })
      .catch(() => {
        if (active) setReviews([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!form.rating) {
      setError("Please select a star rating.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitProductReview({
        productId,
        rating: form.rating,
        title: form.title,
        comment: form.comment
      });
      setForm(EMPTY_FORM);
      setNotice(
        result?.status === "approved"
          ? "Thanks! Your review is now live."
          : "Thanks! Your review has been submitted and is awaiting approval."
      );
    } catch (submitError) {
      setError(submitError.message || "Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="proto-section proto-reviews-section">
      <h2>Reviews &amp; Ratings</h2>

      <div className="proto-reviews-summary">
        <StarRating value={summary.avgRating} />
        <span>
          {summary.reviewCount > 0
            ? `${summary.avgRating.toFixed(1)} out of 5 (${summary.reviewCount} review${summary.reviewCount === 1 ? "" : "s"})`
            : "No reviews yet"}
        </span>
      </div>

      {loading ? null : reviews.length === 0 ? (
        <p className="muted">Be the first to review this product.</p>
      ) : (
        <ul className="proto-reviews-list">
          {reviews.map((review) => (
            <li key={review.id} className="proto-review-item">
              <div className="proto-review-item-head">
                <StarRating value={review.rating} />
                <strong>{review.title}</strong>
              </div>
              <p>{review.comment}</p>
              <span className="muted">
                {review.customerName} · {new Date(review.createdAt).toLocaleDateString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="proto-review-form-card">
        <h3>Write a Review</h3>

        {!isAuthenticated ? (
          <StorefrontAlert tone="info">Log in to your account to write a review.</StorefrontAlert>
        ) : (
          <form onSubmit={onSubmit} className="proto-review-form">
            {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
            {notice ? <StorefrontAlert tone="info">{notice}</StorefrontAlert> : null}

            <StarRating
              value={form.rating}
              onChange={(rating) => setForm((current) => ({ ...current, rating }))}
            />

            <StorefrontInput
              label="Review title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              maxLength={120}
              required
            />

            <StorefrontTextArea
              label="Your review"
              value={form.comment}
              onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
              rows={4}
              maxLength={2000}
              required
            />

            <StorefrontButton type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Review"}
            </StorefrontButton>
          </form>
        )}
      </div>
    </section>
  );
}
