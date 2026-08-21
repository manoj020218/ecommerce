const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const { sanitizeCmsHtml } = require("../../common/html-sanitizer");
const {
  readJobVacanciesStore,
  writeJobVacanciesStore
} = require("../../database/job-vacancies-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { getAllSettings } = require("../settings/settings.service");
const {
  JOB_STATUS,
  slugify,
  cloneDefaultContentStore,
  normalizeResponsibilities,
  buildPublicJobPath,
  isJobPublished,
  sanitizeAdminJob,
  toPublicJobCard
} = require("./job-vacancies.model");

function stripHtmlToText(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureJobVacanciesStoreShape(store) {
  const defaults = cloneDefaultContentStore();
  let changed = false;

  if (!Array.isArray(store.jobVacancies)) {
    store.jobVacancies = defaults.jobVacancies;
    changed = true;
  }

  return changed;
}

async function readNormalizedJobVacanciesStore() {
  const store = await readJobVacanciesStore();
  const changed = ensureJobVacanciesStoreShape(store);
  if (changed) {
    await writeJobVacanciesStore(store);
  }
  return store;
}

function normalizeBaseUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return env.publicBaseUrl.replace(/\/$/, "");
  }
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/$/, "");
  }
  return `https://${value.replace(/\/$/, "")}`;
}

function ensureUniqueJobSlug(store, slug, ignoreJobId = null) {
  const duplicate = store.jobVacancies.find(
    (job) => job.id !== ignoreJobId && job.slug === slug
  );
  if (duplicate) {
    throw new HttpError(409, "Job vacancy slug already exists.");
  }
}

function buildSearchText(job) {
  return [
    job.title,
    job.slug,
    job.department,
    job.qualification,
    job.location?.locality,
    job.location?.region,
    ...(job.responsibilities || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function listPublishedJobRows(store) {
  return store.jobVacancies
    .filter((job) => isJobPublished(job))
    .sort((a, b) => Date.parse(b.postedAt || b.updatedAt) - Date.parse(a.postedAt || a.updatedAt));
}

function formatSalaryLine(job) {
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

// Builds the full public-facing job description as sanitized HTML -- used
// both for the visible page content and as the JobPosting JSON-LD
// `description` (Google explicitly supports/recommends HTML formatting
// there). Deliberately excludes ageMin/ageMax/genderPreference -- see the
// comment on GENDER_PREFERENCES in job-vacancies.model.js.
function buildJobDescriptionHtml(job) {
  const parts = [];

  if (job.department) {
    parts.push(`<p><strong>Department:</strong> ${job.department}</p>`);
  }

  const responsibilities = normalizeResponsibilities(job.responsibilities);
  if (responsibilities.length > 0) {
    parts.push(
      `<p><strong>Work Profile:</strong></p><ul>${responsibilities
        .map((line) => `<li>${line}</li>`)
        .join("")}</ul>`
    );
  }

  if (job.qualification) {
    parts.push(`<p><strong>Required Qualification / Experience:</strong> ${job.qualification}</p>`);
  }

  const salaryLine = formatSalaryLine(job);
  if (salaryLine) {
    parts.push(`<p><strong>Salary:</strong> ${salaryLine}</p>`);
  }

  const locality = job.location?.locality || "";
  if (locality) {
    const radius = Number(job.preferredRadiusKm || 0);
    parts.push(
      `<p><strong>Location:</strong> ${locality}${job.location?.region ? `, ${job.location.region}` : ""}${
        radius > 0 ? ` (candidates within ${radius}km preferred)` : ""
      }</p>`
    );
  }

  if (job.officeHoursText) {
    parts.push(`<p><strong>Office Hours:</strong> ${job.officeHoursText}</p>`);
  }

  if (job.numberOfPositions) {
    parts.push(`<p><strong>Openings:</strong> ${Number(job.numberOfPositions)}</p>`);
  }

  if (job.howToApplyText) {
    parts.push(`<p><strong>How to Apply:</strong> ${job.howToApplyText}</p>`);
  }

  return sanitizeCmsHtml(parts.join(""));
}

function buildJobPostingJsonLd(job, options) {
  const description = buildJobDescriptionHtml(job);
  const address = {
    "@type": "PostalAddress",
    streetAddress: job.location?.addressLine || "",
    addressLocality: job.location?.locality || "",
    addressRegion: job.location?.region || "",
    postalCode: job.location?.postalCode || "",
    addressCountry: job.location?.country || "IN"
  };

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description,
    identifier: {
      "@type": "PropertyValue",
      name: options.storeName,
      value: job.id
    },
    datePosted: job.postedAt,
    validThrough: job.validThrough || undefined,
    employmentType: job.employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: options.storeName,
      sameAs: options.baseUrl,
      logo: options.brandLogoUrl || undefined
    },
    jobLocation: {
      "@type": "Place",
      address
    },
    workHours: job.officeHoursText || undefined,
    qualifications: job.qualification || undefined,
    experienceRequirements: job.experienceRequirementsText || undefined,
    educationRequirements: job.educationRequirement || undefined,
    directApply: true,
    url: options.canonicalUrl
  };

  if (job.salaryMin || job.salaryMax) {
    jsonLd.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency || "INR",
      value: {
        "@type": "QuantitativeValue",
        minValue: Number(job.salaryMin || job.salaryMax || 0),
        maxValue: Number(job.salaryMax || job.salaryMin || 0),
        unitText: job.salaryPeriod || "MONTH"
      }
    };
  }

  return jsonLd;
}

async function listAdminJobVacancies(filters) {
  const store = await readNormalizedJobVacanciesStore();

  let rows = [...store.jobVacancies];
  if (filters.status) {
    rows = rows.filter((job) => job.status === filters.status);
  }
  if (filters.q) {
    const query = filters.q.toLowerCase();
    rows = rows.filter((job) => buildSearchText(job).includes(query));
  }

  return rows
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, filters.limit)
    .map(sanitizeAdminJob);
}

async function getAdminJobVacancyById(jobId) {
  const store = await readNormalizedJobVacanciesStore();
  const job = store.jobVacancies.find((row) => row.id === jobId);
  if (!job) {
    throw new HttpError(404, "Job vacancy not found.");
  }
  return sanitizeAdminJob(job);
}

async function createJobVacancy(payload, actor) {
  const store = await readNormalizedJobVacanciesStore();

  const slug = payload.slug ? slugify(payload.slug) : slugify(payload.title);
  ensureUniqueJobSlug(store, slug);

  const now = new Date().toISOString();
  const postedAt = payload.status === JOB_STATUS.PUBLISHED ? payload.postedAt || now : payload.postedAt || null;

  const job = {
    id: generateId("job"),
    title: payload.title,
    slug,
    department: payload.department || "",
    responsibilities: normalizeResponsibilities(payload.responsibilities),
    qualification: payload.qualification || "",
    experienceRequirementsText: payload.experienceRequirementsText || "",
    educationRequirement: payload.educationRequirement || "",
    employmentType: payload.employmentType,
    salaryMin: Number(payload.salaryMin || 0),
    salaryMax: Number(payload.salaryMax || 0),
    salaryCurrency: payload.salaryCurrency || "INR",
    salaryPeriod: payload.salaryPeriod || "MONTH",
    numberOfPositions: Number(payload.numberOfPositions || 1),
    location: {
      addressLine: payload.location?.addressLine || "",
      locality: payload.location?.locality || "",
      region: payload.location?.region || "",
      postalCode: payload.location?.postalCode || "",
      country: payload.location?.country || "IN"
    },
    preferredRadiusKm: Number(payload.preferredRadiusKm || 0),
    officeHoursText: payload.officeHoursText || "",
    // Internal-only screening fields -- never rendered publicly or in JSON-LD.
    ageMin: payload.ageMin === undefined || payload.ageMin === null ? null : Number(payload.ageMin),
    ageMax: payload.ageMax === undefined || payload.ageMax === null ? null : Number(payload.ageMax),
    genderPreference: payload.genderPreference || "any",
    contactEmail: payload.contactEmail || "",
    contactPhone: payload.contactPhone || "",
    contactWhatsapp: payload.contactWhatsapp || "",
    howToApplyText: payload.howToApplyText || "",
    status: payload.status,
    postedAt,
    validThrough: payload.validThrough || null,
    seoTitle: payload.seoTitle || "",
    seoDescription: payload.seoDescription || "",
    canonicalUrl: payload.canonicalUrl || "",
    createdAt: now,
    updatedAt: now
  };

  store.jobVacancies.push(job);
  await writeJobVacanciesStore(store);

  await addActivityLog({
    action: "job_vacancies.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "job_vacancy",
    resourceId: job.id
  });

  return sanitizeAdminJob(job);
}

async function updateJobVacancy(jobId, patch, actor) {
  const store = await readNormalizedJobVacanciesStore();
  const index = store.jobVacancies.findIndex((job) => job.id === jobId);
  if (index < 0) {
    throw new HttpError(404, "Job vacancy not found.");
  }

  const current = store.jobVacancies[index];
  const nextTitle = patch.title || current.title;
  const nextSlug = patch.slug ? slugify(patch.slug) : current.slug;
  ensureUniqueJobSlug(store, nextSlug, jobId);

  const nextStatus = patch.status || current.status;
  const nextPostedAt =
    patch.postedAt !== undefined ? patch.postedAt : current.postedAt;

  const next = {
    ...current,
    ...patch,
    title: nextTitle,
    slug: nextSlug,
    responsibilities:
      patch.responsibilities === undefined
        ? current.responsibilities
        : normalizeResponsibilities(patch.responsibilities),
    location:
      patch.location === undefined
        ? current.location
        : {
            addressLine: patch.location.addressLine || "",
            locality: patch.location.locality || "",
            region: patch.location.region || "",
            postalCode: patch.location.postalCode || "",
            country: patch.location.country || "IN"
          },
    status: nextStatus,
    postedAt:
      nextStatus === JOB_STATUS.PUBLISHED
        ? nextPostedAt || current.postedAt || new Date().toISOString()
        : nextPostedAt,
    updatedAt: new Date().toISOString()
  };

  store.jobVacancies[index] = next;
  await writeJobVacanciesStore(store);

  await addActivityLog({
    action: "job_vacancies.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "job_vacancy",
    resourceId: jobId,
    metadata: { changedFields: Object.keys(patch) }
  });

  return sanitizeAdminJob(next);
}

async function closeJobVacancy(jobId, actor) {
  return updateJobVacancy(jobId, { status: JOB_STATUS.CLOSED }, actor);
}

async function listPublicJobVacancies(filters) {
  const store = await readNormalizedJobVacanciesStore();
  let rows = listPublishedJobRows(store);

  if (filters.q) {
    const query = filters.q.toLowerCase();
    rows = rows.filter((job) => buildSearchText(job).includes(query));
  }

  return rows.slice(0, filters.limit).map(toPublicJobCard);
}

async function getPublicJobVacancyBySlug(slug) {
  const [store, settings] = await Promise.all([
    readNormalizedJobVacanciesStore(),
    getAllSettings()
  ]);

  const job = store.jobVacancies.find((row) => row.slug === slug && isJobPublished(row));
  if (!job) {
    throw new HttpError(404, "Job vacancy not found.");
  }

  const baseUrl = normalizeBaseUrl(settings.seoDefaults.canonicalDomain || env.publicBaseUrl);
  const canonicalUrl = job.canonicalUrl || `${baseUrl}${buildPublicJobPath(job.slug)}`;
  const storeName = settings.storeProfile.storeName || "Jenix India";
  const brandLogoUrl = settings.branding.brandLogoUrl || "";

  const posting = {
    ...toPublicJobCard(job),
    descriptionHtml: buildJobDescriptionHtml(job),
    responsibilities: normalizeResponsibilities(job.responsibilities),
    qualification: job.qualification,
    experienceRequirementsText: job.experienceRequirementsText || "",
    educationRequirement: job.educationRequirement || "",
    preferredRadiusKm: Number(job.preferredRadiusKm || 0),
    contactEmail: job.contactEmail || "",
    contactPhone: job.contactPhone || "",
    contactWhatsapp: job.contactWhatsapp || "",
    howToApplyText: job.howToApplyText || "",
    seoTitle: job.seoTitle || job.title,
    seoDescription: job.seoDescription || stripHtmlToText(buildJobDescriptionHtml(job)).slice(0, 300),
    canonicalUrl
  };

  return {
    job: posting,
    structuredData: {
      jobPosting: buildJobPostingJsonLd(job, { canonicalUrl, baseUrl, storeName, brandLogoUrl })
    }
  };
}

module.exports = {
  listAdminJobVacancies,
  getAdminJobVacancyById,
  createJobVacancy,
  updateJobVacancy,
  closeJobVacancy,
  listPublicJobVacancies,
  getPublicJobVacancyBySlug,
  listPublishedJobRows,
  readNormalizedJobVacanciesStore
};
