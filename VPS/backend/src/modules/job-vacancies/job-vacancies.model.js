const JOB_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  CLOSED: "closed"
});

// Matches schema.org JobPosting's employmentType enum values exactly —
// Google's structured-data validator checks these literally.
const EMPLOYMENT_TYPES = Object.freeze([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACTOR",
  "TEMPORARY",
  "INTERN",
  "VOLUNTEER",
  "PER_DIEM",
  "OTHER"
]);

const SALARY_PERIODS = Object.freeze(["HOUR", "DAY", "WEEK", "MONTH", "YEAR"]);

// Internal-only, admin-facing screening field. Deliberately never surfaced
// on the public page or in JobPosting JSON-LD -- schema.org has no such
// property, and publishing an explicit gender filter on a public listing
// risks the posting being rejected/flagged under Google's job-content
// policies (and carries needless legal exposure). Kept here purely so
// staff reviewing applicants can filter/screen internally.
const GENDER_PREFERENCES = Object.freeze(["any", "male", "female"]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULT_JOB_VACANCIES_CONTENT = Object.freeze({
  jobVacancies: []
});

function cloneDefaultContentStore() {
  return JSON.parse(JSON.stringify(DEFAULT_JOB_VACANCIES_CONTENT));
}

function dedupeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeResponsibilities(values) {
  if (Array.isArray(values)) {
    return dedupeStringList(values);
  }
  // Admin form submits a single textarea (one responsibility per line) --
  // accept that shape too rather than forcing the caller to pre-split it.
  return dedupeStringList(String(values || "").split("\n"));
}

function buildPublicJobPath(slug) {
  return `/careers/${slug}`;
}

function isJobPublished(job) {
  if (!job || job.status !== JOB_STATUS.PUBLISHED) {
    return false;
  }
  if (!job.postedAt) {
    return false;
  }
  if (Date.parse(job.postedAt) > Date.now()) {
    return false;
  }
  if (job.validThrough && Date.parse(job.validThrough) < Date.now()) {
    return false;
  }
  return true;
}

function sanitizeAdminJob(job) {
  return {
    ...job,
    responsibilities: normalizeResponsibilities(job.responsibilities)
  };
}

// Public-facing card + detail both need this -- age/gender screening
// fields deliberately excluded, see GENDER_PREFERENCES comment above.
function toPublicJobCard(job) {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    department: job.department || "",
    employmentType: job.employmentType,
    numberOfPositions: Number(job.numberOfPositions || 1),
    salaryMin: Number(job.salaryMin || 0),
    salaryMax: Number(job.salaryMax || 0),
    salaryCurrency: job.salaryCurrency || "INR",
    salaryPeriod: job.salaryPeriod || "MONTH",
    location: {
      locality: job.location?.locality || "",
      region: job.location?.region || ""
    },
    postedAt: job.postedAt,
    validThrough: job.validThrough || null,
    publicPath: buildPublicJobPath(job.slug)
  };
}

module.exports = {
  JOB_STATUS,
  EMPLOYMENT_TYPES,
  SALARY_PERIODS,
  GENDER_PREFERENCES,
  slugify,
  cloneDefaultContentStore,
  dedupeStringList,
  normalizeResponsibilities,
  buildPublicJobPath,
  isJobPublished,
  sanitizeAdminJob,
  toPublicJobCard
};
