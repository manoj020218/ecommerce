import { useEffect, useState } from "react";
import {
  StorefrontAlert,
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontPageHeader
} from "../../shared/storefront/storefront-ui";
import { listJobVacancies } from "./careers.api";

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
  const periodLabel = { hour: "/hr", day: "/day", week: "/wk", month: "/month", year: "/yr" }[period] || "/month";
  if (job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax) {
    return `₹${fmt(job.salaryMin)} – ₹${fmt(job.salaryMax)} ${periodLabel}`;
  }
  return `₹${fmt(job.salaryMin || job.salaryMax)} ${periodLabel}`;
}

function humanizeEmploymentType(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function JobCard({ job }) {
  const salary = formatSalary(job);

  return (
    <StorefrontCard as="article" className="guide-list-card" elevated>
      <div className="guide-list-copy">
        <div className="hero-kicker-row">
          <StorefrontBadge className="eyebrow-chip">{job.department || "Jenix India"}</StorefrontBadge>
          <span className="guide-meta-text">
            {[humanizeEmploymentType(job.employmentType), formatDate(job.postedAt)].filter(Boolean).join(" | ")}
          </span>
        </div>
        <h3>{job.title}</h3>
        <p>
          {[
            [job.location?.locality, job.location?.region].filter(Boolean).join(", "),
            salary,
            job.numberOfPositions ? `${job.numberOfPositions} opening${job.numberOfPositions === 1 ? "" : "s"}` : ""
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <StorefrontButton to={`/careers/${job.slug}`} variant="light" className="compact-guide-link">
        View & Apply
      </StorefrontButton>
    </StorefrontCard>
  );
}

export function CareersListPage() {
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    listJobVacancies({ q: query })
      .then((rows) => {
        if (active) {
          setJobs(Array.isArray(rows) ? rows : []);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Failed to load job vacancies.");
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
  }, [query]);

  return (
    <main className="proto-main-shell">
      <div className="proto-page-hero">
        <StorefrontPageHeader
          eyebrow="Careers"
          title="Current Job Openings at Jenix India"
          description="Roles across production, technical, and support teams — updated as positions open and close."
        />

        <form
          className="guide-filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(searchText.trim());
          }}
        >
          <StorefrontInput
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by role, department, or location"
          />
          <StorefrontButton type="submit">Search</StorefrontButton>
        </form>
      </div>

      <section className="list-meta">
        <p>{query ? `Showing results for "${query}"` : "Browse all open positions"}</p>
        <strong>{jobs.length} opening{jobs.length === 1 ? "" : "s"}</strong>
      </section>

      {loading ? <StorefrontLoadingState label="Loading job vacancies..." /> : null}
      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}

      {!loading && !error ? (
        jobs.length > 0 ? (
          <section className="guide-list-grid">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </section>
        ) : (
          <StorefrontAlert>No open positions right now — check back soon.</StorefrontAlert>
        )
      ) : null}
    </main>
  );
}
