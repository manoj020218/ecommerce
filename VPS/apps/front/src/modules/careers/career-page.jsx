import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontErrorState,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontSectionHeader
} from "../../shared/storefront/storefront-ui";
import { getSupportWhatsappLink } from "../account/account.utils";
import { getJobVacancy } from "./careers.api";

function formatDate(value) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatSalary(job) {
  if (!job.salaryMin && !job.salaryMax) {
    return "";
  }
  const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
  const period = String(job.salaryPeriod || "MONTH").toLowerCase();
  const periodLabel = { hour: "per hour", day: "per day", week: "per week", month: "per month", year: "per year" }[period] || "per month";
  if (job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax) {
    return `₹${fmt(job.salaryMin)} – ₹${fmt(job.salaryMax)} ${periodLabel} (net)`;
  }
  return `₹${fmt(job.salaryMin || job.salaryMax)} ${periodLabel} (net)`;
}

function humanizeEmploymentType(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CareerPage() {
  const { slug } = useParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getJobVacancy(slug)
      .then((data) => {
        if (active) {
          setPayload(data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Failed to load job vacancy.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const job = payload?.job || null;

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading job vacancy..." />
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="proto-main-shell">
        <StorefrontErrorState
          message={error || "Job vacancy not found."}
          action={<StorefrontButton to="/careers" variant="light">Back to careers</StorefrontButton>}
        />
      </main>
    );
  }

  const salary = formatSalary(job);
  const locationText = [job.location?.locality, job.location?.region].filter(Boolean).join(", ");
  const whatsappLink = job.contactWhatsapp
    ? getSupportWhatsappLink(job.contactWhatsapp, `Applying for: ${job.title}`)
    : "";

  return (
    <main className="proto-main-shell guide-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(payload.structuredData?.jobPosting || {}) }}
      />

      <div className="proto-page-hero">
        <StorefrontPageHeader
          eyebrow={job.department || "Careers"}
          title={job.title}
          description={[locationText, salary].filter(Boolean).join(" · ")}
          meta={
            <div className="chip-row">
              <StorefrontBadge className="search-chip">{humanizeEmploymentType(job.employmentType)}</StorefrontBadge>
              {job.numberOfPositions ? (
                <StorefrontBadge className="search-chip">
                  {job.numberOfPositions} opening{job.numberOfPositions === 1 ? "" : "s"}
                </StorefrontBadge>
              ) : null}
              {job.postedAt ? (
                <StorefrontBadge className="search-chip">Posted {formatDate(job.postedAt)}</StorefrontBadge>
              ) : null}
            </div>
          }
          actions={<StorefrontButton to="/careers" variant="light">All Openings</StorefrontButton>}
        />
      </div>

      <StorefrontCard
        as="section"
        className="guide-content-card"
        elevated
        dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
      />

      <StorefrontCard as="section" className="section-card" elevated>
        <StorefrontSectionHeader
          title="How to Apply"
          description={job.howToApplyText || "Reach out to us directly to apply for this role."}
        />
        <div className="cta-grid">
          {whatsappLink ? (
            <StorefrontButton href={whatsappLink} variant="whatsapp">
              Apply via WhatsApp
            </StorefrontButton>
          ) : null}
          {job.contactEmail ? (
            <StorefrontButton href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(`Application: ${job.title}`)}`} variant="light">
              Apply via Email
            </StorefrontButton>
          ) : null}
          {job.contactPhone ? (
            <StorefrontButton href={`tel:${job.contactPhone}`} variant="light">
              Call {job.contactPhone}
            </StorefrontButton>
          ) : null}
        </div>
      </StorefrontCard>
    </main>
  );
}
