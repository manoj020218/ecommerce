import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  closeJobVacancy,
  createJobVacancy,
  fetchJobVacancies,
  updateJobVacancy
} from "./job-vacancies.api";

// ── Helpers ────────────────────────────────────────────────────────────────────

const EMPLOYMENT_TYPES = [
  ["FULL_TIME", "Full Time"],
  ["PART_TIME", "Part Time"],
  ["CONTRACTOR", "Contractor"],
  ["TEMPORARY", "Temporary"],
  ["INTERN", "Intern"],
  ["VOLUNTEER", "Volunteer"],
  ["PER_DIEM", "Per Diem"],
  ["OTHER", "Other"]
];

const SALARY_PERIODS = [
  ["HOUR", "Per Hour"],
  ["DAY", "Per Day"],
  ["WEEK", "Per Week"],
  ["MONTH", "Per Month"],
  ["YEAR", "Per Year"]
];

function formatDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function defaultValidThrough() {
  const date = new Date();
  date.setDate(date.getDate() + 45);
  return formatDateInput(date.toISOString());
}

const EMPTY_FORM = {
  title: "",
  slug: "",
  department: "",
  responsibilitiesText: "",
  qualification: "",
  experienceRequirementsText: "",
  educationRequirement: "",
  employmentType: "FULL_TIME",
  salaryMin: "",
  salaryMax: "",
  salaryPeriod: "MONTH",
  numberOfPositions: "1",
  addressLine: "",
  locality: "",
  region: "",
  postalCode: "",
  country: "IN",
  preferredRadiusKm: "",
  officeHoursText: "",
  ageMin: "",
  ageMax: "",
  genderPreference: "any",
  contactEmail: "",
  contactPhone: "",
  contactWhatsapp: "",
  howToApplyText: "",
  status: "draft",
  postedAt: "",
  validThrough: defaultValidThrough(),
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: ""
};

function formFromJob(job) {
  return {
    title: job.title || "",
    slug: job.slug || "",
    department: job.department || "",
    responsibilitiesText: (job.responsibilities || []).join("\n"),
    qualification: job.qualification || "",
    experienceRequirementsText: job.experienceRequirementsText || "",
    educationRequirement: job.educationRequirement || "",
    employmentType: job.employmentType || "FULL_TIME",
    salaryMin: job.salaryMin ? String(job.salaryMin) : "",
    salaryMax: job.salaryMax ? String(job.salaryMax) : "",
    salaryPeriod: job.salaryPeriod || "MONTH",
    numberOfPositions: job.numberOfPositions ? String(job.numberOfPositions) : "1",
    addressLine: job.location?.addressLine || "",
    locality: job.location?.locality || "",
    region: job.location?.region || "",
    postalCode: job.location?.postalCode || "",
    country: job.location?.country || "IN",
    preferredRadiusKm: job.preferredRadiusKm ? String(job.preferredRadiusKm) : "",
    officeHoursText: job.officeHoursText || "",
    ageMin: job.ageMin === null || job.ageMin === undefined ? "" : String(job.ageMin),
    ageMax: job.ageMax === null || job.ageMax === undefined ? "" : String(job.ageMax),
    genderPreference: job.genderPreference || "any",
    contactEmail: job.contactEmail || "",
    contactPhone: job.contactPhone || "",
    contactWhatsapp: job.contactWhatsapp || "",
    howToApplyText: job.howToApplyText || "",
    status: job.status || "draft",
    postedAt: formatDateInput(job.postedAt),
    validThrough: formatDateInput(job.validThrough) || defaultValidThrough(),
    seoTitle: job.seoTitle || "",
    seoDescription: job.seoDescription || "",
    canonicalUrl: job.canonicalUrl || ""
  };
}

function buildPayload(form) {
  return {
    title: form.title,
    slug: form.slug.trim() || undefined,
    department: form.department,
    responsibilities: form.responsibilitiesText,
    qualification: form.qualification,
    experienceRequirementsText: form.experienceRequirementsText,
    educationRequirement: form.educationRequirement,
    employmentType: form.employmentType,
    salaryMin: form.salaryMin ? Number(form.salaryMin) : 0,
    salaryMax: form.salaryMax ? Number(form.salaryMax) : 0,
    salaryPeriod: form.salaryPeriod,
    numberOfPositions: form.numberOfPositions ? Number(form.numberOfPositions) : 1,
    location: {
      addressLine: form.addressLine,
      locality: form.locality,
      region: form.region,
      postalCode: form.postalCode,
      country: form.country
    },
    preferredRadiusKm: form.preferredRadiusKm ? Number(form.preferredRadiusKm) : 0,
    officeHoursText: form.officeHoursText,
    ageMin: form.ageMin === "" ? null : Number(form.ageMin),
    ageMax: form.ageMax === "" ? null : Number(form.ageMax),
    genderPreference: form.genderPreference,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    contactWhatsapp: form.contactWhatsapp,
    howToApplyText: form.howToApplyText,
    status: form.status,
    postedAt: form.postedAt ? new Date(form.postedAt).toISOString() : null,
    validThrough: form.validThrough ? new Date(form.validThrough).toISOString() : null,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    canonicalUrl: form.canonicalUrl
  };
}

export function JobVacanciesPage() {
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "job_vacancies.create");
  const canEdit = hasPermission(session, "job_vacancies.edit");
  const canDelete = hasPermission(session, "job_vacancies.delete");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadJobs = async (nextFilters = filters) => {
    try {
      const data = await fetchJobVacancies(nextFilters);
      setRows(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load job vacancies.");
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      await loadJobs(filters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setNotice("");
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(formFromJob(row));
    setNotice("");
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
  };

  const onFormChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onFilterSubmit = async (e) => {
    e.preventDefault();
    await loadJobs(filters);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const payload = buildPayload(form);
      if (editingId) {
        await updateJobVacancy(editingId, payload);
      } else {
        await createJobVacancy(payload);
      }
      setNotice(editingId ? "Job vacancy updated." : "Job vacancy created.");
      closeModal();
      await loadJobs(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to save job vacancy.");
    } finally {
      setSaving(false);
    }
  };

  const onClose = async (row) => {
    if (!window.confirm(`Close job vacancy "${row.title}"? It will stop showing publicly.`)) return;
    try {
      await closeJobVacancy(row.id);
      setNotice(`Job vacancy closed: ${row.title}`);
      await loadJobs(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to close job vacancy.");
    }
  };

  if (loading) return <LoadingBlock label="Loading job vacancies..." />;
  if (error && rows.length === 0) return <ErrorBlock message={error} onRetry={bootstrap} />;

  return (
    <section className="stack">
      <PageHeader
        title="Job Vacancies / Careers"
        description="Postings shown on /careers — published ones carry full Google-for-Jobs structured data."
        actions={canCreate ? (
          <button type="button" className="btn btn-primary" onClick={openCreate}>Add Job Vacancy</button>
        ) : null}
      />

      <form className="filter-bar" onSubmit={onFilterSubmit}>
        <input
          type="search" placeholder="Search title, department, qualification..."
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </select>
        <button type="submit" className="btn btn-secondary">Apply</button>
      </form>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Department</th>
              <th>Openings</th>
              <th>Location</th>
              <th>Status</th>
              <th>Posted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                  <p className="row-sub">{row.slug}</p>
                </td>
                <td>{row.department || "—"}</td>
                <td>{row.numberOfPositions || 1}</td>
                <td>{[row.location?.locality, row.location?.region].filter(Boolean).join(", ") || "—"}</td>
                <td><StatusBadge value={row.status} /></td>
                <td>{formatDateTime(row.postedAt)}</td>
                <td className="row-actions">
                  {canEdit ? <button type="button" className="btn-link" onClick={() => openEdit(row)}>Edit</button> : null}
                  {canDelete && row.status !== "closed" ? (
                    <button type="button" className="btn-link danger" onClick={() => onClose(row)}>Close</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {rows.map((row) => (
          <article key={row.id} className="card">
            <div className="card-head">
              <h4>{row.title}</h4>
              <StatusBadge value={row.status} />
            </div>
            <p className="muted">{row.department || "—"} · {row.numberOfPositions || 1} opening(s)</p>
            <p className="muted">{[row.location?.locality, row.location?.region].filter(Boolean).join(", ") || "—"}</p>
            <p className="muted">Posted {formatDateTime(row.postedAt)}</p>
            <div className="card-actions">
              {canEdit ? <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>Edit</button> : null}
              {canDelete && row.status !== "closed" ? (
                <button type="button" className="btn btn-danger" onClick={() => onClose(row)}>Close</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <Modal
        title={editingId ? "Edit Job Vacancy" : "Add Job Vacancy"}
        open={modalOpen}
        onClose={closeModal}
        width="900px"
        disableOutsideClick
      >
        <form className="form-grid wide" onSubmit={onSubmit}>

          <h4 className="form-section">Core</h4>
          <label className="field">
            <span>Job Title *</span>
            <input name="title" value={form.title} onChange={onFormChange} required
              placeholder="e.g. ITI Electrical / Electronics Technician" />
          </label>
          <label className="field">
            <span>Slug</span>
            <input name="slug" value={form.slug} onChange={onFormChange} placeholder="auto-generated from title if left blank" />
          </label>
          <label className="field">
            <span>Department</span>
            <input name="department" value={form.department} onChange={onFormChange} placeholder="e.g. Production / Assembly" />
          </label>
          <label className="field">
            <span>Status</span>
            <select name="status" value={form.status} onChange={onFormChange}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
          </label>

          <label className="field wide">
            <span>Work Profile / Responsibilities (one per line) *</span>
            <textarea name="responsibilitiesText" value={form.responsibilitiesText} onChange={onFormChange}
              rows={5} required
              placeholder={"Soldering\nPacking\nPCB development\nStock arranging of components\nMaterial packing"} />
          </label>

          <h4 className="form-section">Qualification &amp; Pay</h4>
          <label className="field wide">
            <span>Required Qualification / Experience *</span>
            <input name="qualification" value={form.qualification} onChange={onFormChange} required
              placeholder="e.g. ITI Fresher or up to 2 years experience" />
          </label>
          <label className="field">
            <span>Education Requirement</span>
            <input name="educationRequirement" value={form.educationRequirement} onChange={onFormChange} placeholder="e.g. ITI" />
          </label>
          <label className="field">
            <span>Experience (short text, e.g. "0–2 years")</span>
            <input name="experienceRequirementsText" value={form.experienceRequirementsText} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Employment Type</span>
            <select name="employmentType" value={form.employmentType} onChange={onFormChange}>
              {EMPLOYMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Number of Openings</span>
            <input type="number" min="1" name="numberOfPositions" value={form.numberOfPositions} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Salary Min (₹ net)</span>
            <input type="number" min="0" name="salaryMin" value={form.salaryMin} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Salary Max (₹ net)</span>
            <input type="number" min="0" name="salaryMax" value={form.salaryMax} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Salary Period</span>
            <select name="salaryPeriod" value={form.salaryPeriod} onChange={onFormChange}>
              {SALARY_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <h4 className="form-section">Location</h4>
          <label className="field wide">
            <span>Address Line</span>
            <input name="addressLine" value={form.addressLine} onChange={onFormChange} placeholder="e.g. 27 Industrial Market" />
          </label>
          <label className="field">
            <span>City / Locality *</span>
            <input name="locality" value={form.locality} onChange={onFormChange} required placeholder="e.g. New Delhi" />
          </label>
          <label className="field">
            <span>State</span>
            <input name="region" value={form.region} onChange={onFormChange} placeholder="e.g. Delhi" />
          </label>
          <label className="field">
            <span>Postal Code</span>
            <input name="postalCode" value={form.postalCode} onChange={onFormChange} placeholder="6-digit PIN — improves Google Jobs local matching" />
          </label>
          <label className="field">
            <span>Preferred Candidate Radius (km)</span>
            <input type="number" min="0" name="preferredRadiusKm" value={form.preferredRadiusKm} onChange={onFormChange} placeholder="e.g. 10" />
          </label>
          <label className="field">
            <span>Office Hours</span>
            <input name="officeHoursText" value={form.officeHoursText} onChange={onFormChange} placeholder="e.g. 10 AM – 7 PM, Sunday off" />
          </label>

          <h4 className="form-section">Internal Screening (not shown publicly)</h4>
          <p className="row-sub wide" style={{ margin: "-6px 0 4px" }}>
            Age and gender preference have no equivalent in Google&apos;s job posting format and are not published
            on the site or sent to search engines — use these only for your own applicant screening.
          </p>
          <label className="field">
            <span>Min Age</span>
            <input type="number" min="16" max="70" name="ageMin" value={form.ageMin} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Max Age</span>
            <input type="number" min="16" max="70" name="ageMax" value={form.ageMax} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Gender Preference</span>
            <select name="genderPreference" value={form.genderPreference} onChange={onFormChange}>
              <option value="any">Any</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>

          <h4 className="form-section">Contact &amp; Apply</h4>
          <label className="field">
            <span>Contact Email</span>
            <input type="email" name="contactEmail" value={form.contactEmail} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Contact Phone</span>
            <input name="contactPhone" value={form.contactPhone} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>WhatsApp Number</span>
            <input name="contactWhatsapp" value={form.contactWhatsapp} onChange={onFormChange} placeholder="+91XXXXXXXXXX" />
          </label>
          <label className="field wide">
            <span>How to Apply (shown publicly)</span>
            <input name="howToApplyText" value={form.howToApplyText} onChange={onFormChange}
              placeholder="e.g. WhatsApp your resume to the number above, or walk in during office hours." />
          </label>

          <h4 className="form-section">Publishing</h4>
          <label className="field">
            <span>Posted At</span>
            <input type="datetime-local" name="postedAt" value={form.postedAt} onChange={onFormChange} />
          </label>
          <label className="field">
            <span>Valid Through</span>
            <input type="datetime-local" name="validThrough" value={form.validThrough} onChange={onFormChange} />
          </label>
          <label className="field wide">
            <span>SEO Title</span>
            <input name="seoTitle" value={form.seoTitle} onChange={onFormChange} placeholder="defaults to job title" />
          </label>
          <label className="field wide">
            <span>SEO Description</span>
            <input name="seoDescription" value={form.seoDescription} onChange={onFormChange} placeholder="defaults to a summary of the job description" />
          </label>
          <label className="field wide">
            <span>Canonical URL</span>
            <input name="canonicalUrl" value={form.canonicalUrl} onChange={onFormChange} placeholder="defaults to https://yoursite.com/careers/slug" />
          </label>

          <div className="form-actions wide">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Job Vacancy"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
