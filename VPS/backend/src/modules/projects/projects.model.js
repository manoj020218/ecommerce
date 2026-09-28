// Projects / Solutions: custom IoT projects sold on quotation (no fixed price).
// Each project page explains the problem, the solution, how it works, the
// package levels, where it is used, FAQs, and ends in a "Get a quote" form.

const ENQUIRY_STATUSES = Object.freeze(["new", "contacted", "quoted", "won", "lost"]);

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return typeof value === "string" ? value : "";
}

function sanitizeProject(project) {
  const p = project || {};
  return {
    id: p.id,
    slug: str(p.slug),
    title: str(p.title),
    tagline: str(p.tagline),
    summary: str(p.summary),
    heroImageUrl: str(p.heroImageUrl),
    problemTitle: str(p.problemTitle),
    problemText: str(p.problemText),
    solutionTitle: str(p.solutionTitle),
    solutionText: str(p.solutionText),
    steps: ensureArray(p.steps).map((s) => ({ title: str(s.title), text: str(s.text) })),
    packages: ensureArray(p.packages).map((pk) => ({
      name: str(pk.name),
      tagline: str(pk.tagline),
      bestFor: str(pk.bestFor),
      features: ensureArray(pk.features).map(str).filter(Boolean)
    })),
    softwareFeatures: ensureArray(p.softwareFeatures).map(str).filter(Boolean),
    useCases: ensureArray(p.useCases).map(str).filter(Boolean),
    whyUs: ensureArray(p.whyUs).map(str).filter(Boolean),
    gallery: ensureArray(p.gallery).map((g) => ({ url: str(g.url), caption: str(g.caption) })).filter((g) => g.url),
    faqs: ensureArray(p.faqs).map((f) => ({ q: str(f.q), a: str(f.a) })).filter((f) => f.q),
    enquiryQuestions: ensureArray(p.enquiryQuestions).map(str).filter(Boolean),
    seoTitle: str(p.seoTitle),
    seoDescription: str(p.seoDescription),
    isPublished: Boolean(p.isPublished),
    sortOrder: Number(p.sortOrder || 0),
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null
  };
}

function sanitizeProjectCard(project) {
  const p = sanitizeProject(project);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    tagline: p.tagline,
    summary: p.summary,
    heroImageUrl: p.heroImageUrl,
    packageNames: p.packages.map((pk) => pk.name)
  };
}

function sanitizeEnquiry(enquiry) {
  const e = enquiry || {};
  return {
    id: e.id,
    projectId: e.projectId || "",
    projectSlug: str(e.projectSlug),
    projectTitle: str(e.projectTitle),
    name: str(e.name),
    mobile: str(e.mobile),
    email: str(e.email),
    company: str(e.company),
    city: str(e.city),
    packageInterest: str(e.packageInterest),
    answers: ensureArray(e.answers).map((a) => ({ question: str(a.question), answer: str(a.answer) })),
    message: str(e.message),
    status: ENQUIRY_STATUSES.includes(e.status) ? e.status : "new",
    notes: str(e.notes),
    createdAt: e.createdAt || null,
    updatedAt: e.updatedAt || null
  };
}

module.exports = {
  ENQUIRY_STATUSES,
  ensureArray,
  sanitizeProject,
  sanitizeProjectCard,
  sanitizeEnquiry
};
