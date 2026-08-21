const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const {
  JOB_STATUS,
  EMPLOYMENT_TYPES,
  SALARY_PERIODS,
  GENDER_PREFERENCES
} = require("./job-vacancies.model");

const jobStatusSchema = z.enum([JOB_STATUS.DRAFT, JOB_STATUS.PUBLISHED, JOB_STATUS.CLOSED]);
const employmentTypeSchema = z.enum(EMPLOYMENT_TYPES);
const salaryPeriodSchema = z.enum(SALARY_PERIODS);
const genderPreferenceSchema = z.enum(GENDER_PREFERENCES);

const optionalTextSchema = z.string().trim().optional().default("");

const locationSchema = z.object({
  addressLine: optionalTextSchema,
  locality: optionalTextSchema,
  region: optionalTextSchema,
  postalCode: optionalTextSchema,
  country: z.string().trim().max(4).optional().default("IN")
});

const responsibilitiesSchema = z
  .union([z.array(z.string().trim().min(1).max(300)).max(40), z.string().trim().max(6000)])
  .optional()
  .default([]);

const listAdminJobVacanciesQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  status: z.string().trim().max(40).optional().default(""),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

const listPublicJobVacanciesQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

const ageFieldSchema = z.coerce.number().int().min(16).max(70).optional().nullable().default(null);

const createJobVacancySchema = z.object({
  title: z.string().trim().min(5).max(220),
  slug: z.string().trim().min(2).max(220).optional(),
  department: optionalTextSchema,
  responsibilities: responsibilitiesSchema,
  qualification: z.string().trim().min(2).max(600),
  experienceRequirementsText: optionalTextSchema,
  educationRequirement: optionalTextSchema,
  employmentType: employmentTypeSchema.optional().default("FULL_TIME"),
  salaryMin: z.coerce.number().min(0).optional().default(0),
  salaryMax: z.coerce.number().min(0).optional().default(0),
  salaryCurrency: z.string().trim().max(6).optional().default("INR"),
  salaryPeriod: salaryPeriodSchema.optional().default("MONTH"),
  numberOfPositions: z.coerce.number().int().min(1).max(9999).optional().default(1),
  location: locationSchema.optional().default({}),
  preferredRadiusKm: z.coerce.number().min(0).max(1000).optional().default(0),
  officeHoursText: optionalTextSchema,
  ageMin: ageFieldSchema,
  ageMax: ageFieldSchema,
  genderPreference: genderPreferenceSchema.optional().default("any"),
  contactEmail: z.string().trim().max(200).optional().default(""),
  contactPhone: z.string().trim().max(40).optional().default(""),
  contactWhatsapp: z.string().trim().max(40).optional().default(""),
  howToApplyText: optionalTextSchema,
  status: jobStatusSchema.optional().default(JOB_STATUS.DRAFT),
  postedAt: z.string().datetime().optional().nullable().default(null),
  validThrough: z.string().datetime().optional().nullable().default(null),
  seoTitle: optionalTextSchema,
  seoDescription: optionalTextSchema,
  canonicalUrl: optionalTextSchema
});

const updateJobVacancySchema = z.object({
  title: z.string().trim().min(5).max(220).optional(),
  slug: z.string().trim().min(2).max(220).optional(),
  department: z.string().trim().max(160).optional(),
  responsibilities: responsibilitiesSchema.optional(),
  qualification: z.string().trim().min(2).max(600).optional(),
  experienceRequirementsText: z.string().trim().max(200).optional(),
  educationRequirement: z.string().trim().max(200).optional(),
  employmentType: employmentTypeSchema.optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  salaryMax: z.coerce.number().min(0).optional(),
  salaryCurrency: z.string().trim().max(6).optional(),
  salaryPeriod: salaryPeriodSchema.optional(),
  numberOfPositions: z.coerce.number().int().min(1).max(9999).optional(),
  location: locationSchema.optional(),
  preferredRadiusKm: z.coerce.number().min(0).max(1000).optional(),
  officeHoursText: z.string().trim().max(300).optional(),
  ageMin: ageFieldSchema.optional(),
  ageMax: ageFieldSchema.optional(),
  genderPreference: genderPreferenceSchema.optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  contactWhatsapp: z.string().trim().max(40).optional(),
  howToApplyText: z.string().trim().max(2000).optional(),
  status: jobStatusSchema.optional(),
  postedAt: z.string().datetime().optional().nullable(),
  validThrough: z.string().datetime().optional().nullable(),
  seoTitle: z.string().trim().max(220).optional(),
  seoDescription: z.string().trim().max(600).optional(),
  canonicalUrl: z.string().trim().max(2000).optional()
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListAdminJobVacanciesQuery(query) {
  return listAdminJobVacanciesQuerySchema.parse(query || {});
}

function parseListPublicJobVacanciesQuery(query) {
  return listPublicJobVacanciesQuerySchema.parse(query || {});
}

function parseCreateJobVacancyPayload(payload) {
  ensureObject(payload, "Create job vacancy");
  return createJobVacancySchema.parse(payload);
}

function parseUpdateJobVacancyPayload(payload) {
  ensureObject(payload, "Update job vacancy");
  return updateJobVacancySchema.parse(payload);
}

module.exports = {
  parseListAdminJobVacanciesQuery,
  parseListPublicJobVacanciesQuery,
  parseCreateJobVacancyPayload,
  parseUpdateJobVacancyPayload
};
