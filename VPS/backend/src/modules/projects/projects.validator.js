const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ENQUIRY_STATUSES } = require("./projects.model");

// No .default() anywhere: missing fields are filled by sanitizeProject(), and
// for updates only the fields the admin actually sent should change.
const text = (max) => z.string().trim().max(max);
const list = (itemMax, maxItems) => z.array(text(itemMax)).max(maxItems);

const projectFields = {
  slug: z.string().trim().toLowerCase().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers and hyphens only"),
  title: text(200).min(3),
  tagline: text(300).optional(),
  summary: text(600).optional(),
  heroImageUrl: text(2000).optional(),
  problemTitle: text(200).optional(),
  problemText: text(3000).optional(),
  solutionTitle: text(200).optional(),
  solutionText: text(3000).optional(),
  steps: z.array(z.object({ title: text(160), text: text(600) })).max(12).optional(),
  packages: z.array(z.object({ name: text(80), tagline: text(200), bestFor: text(300), features: list(200, 20) })).max(6).optional(),
  softwareFeatures: list(200, 20).optional(),
  useCases: list(120, 30).optional(),
  whyUs: list(200, 12).optional(),
  gallery: z.array(z.object({ url: text(2000), caption: text(200) })).max(20).optional(),
  faqs: z.array(z.object({ q: text(300), a: text(1500) })).max(20).optional(),
  enquiryQuestions: list(120, 10).optional(),
  seoTitle: text(200).optional(),
  seoDescription: text(400).optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional()
};

const createProjectSchema = z.object(projectFields);
const updateProjectSchema = z.object(projectFields).partial();

const createEnquirySchema = z.object({
  name: text(120).min(2, "Please enter your name"),
  mobile: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,19}$/, "Please enter a valid mobile number"),
  email: z.union([z.string().trim().email("Please enter a valid email").max(160), z.literal("")]).optional(),
  company: text(180).optional(),
  city: text(120).min(2, "Please enter your city"),
  packageInterest: text(80).optional(),
  answers: z.array(z.object({ question: text(120), answer: text(300) })).max(10).optional(),
  message: text(2000).optional(),
  // honeypot: hidden field real visitors never fill in
  website: z.string().max(0).optional()
});

const updateEnquirySchema = z
  .object({ status: z.enum(ENQUIRY_STATUSES).optional(), notes: text(3000).optional() })
  .refine((p) => p.status !== undefined || p.notes !== undefined, { message: "Nothing to update." });

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

module.exports = {
  parseCreateProject: (p) => { ensureObject(p, "Project"); return createProjectSchema.parse(p); },
  parseUpdateProject: (p) => { ensureObject(p, "Project"); return updateProjectSchema.parse(p); },
  parseCreateEnquiry: (p) => { ensureObject(p, "Enquiry"); return createEnquirySchema.parse(p); },
  parseUpdateEnquiry: (p) => { ensureObject(p, "Enquiry"); return updateEnquirySchema.parse(p); }
};
