const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./job-vacancies.service");
const {
  parseListAdminJobVacanciesQuery,
  parseListPublicJobVacanciesQuery,
  parseCreateJobVacancyPayload,
  parseUpdateJobVacancyPayload
} = require("./job-vacancies.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", { issues: error.issues });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(mapValidationError(error));
    }
  };
}

const adminListJobVacancies = asyncHandler(async (req, res) => {
  const query = parseListAdminJobVacanciesQuery(req.query || {});
  const data = await service.listAdminJobVacancies(query);
  return ok(res, data, "Job vacancies fetched.");
});

const adminGetJobVacancy = asyncHandler(async (req, res) => {
  const data = await service.getAdminJobVacancyById(req.params.jobId);
  return ok(res, data, "Job vacancy fetched.");
});

const adminCreateJobVacancy = asyncHandler(async (req, res) => {
  const payload = parseCreateJobVacancyPayload(req.body);
  const data = await service.createJobVacancy(payload, req.actor);
  return created(res, data, "Job vacancy created.");
});

const adminUpdateJobVacancy = asyncHandler(async (req, res) => {
  const patch = parseUpdateJobVacancyPayload(req.body);
  const data = await service.updateJobVacancy(req.params.jobId, patch, req.actor);
  return ok(res, data, "Job vacancy updated.");
});

const adminCloseJobVacancy = asyncHandler(async (req, res) => {
  const data = await service.closeJobVacancy(req.params.jobId, req.actor);
  return ok(res, data, "Job vacancy closed.");
});

const publicListJobVacancies = asyncHandler(async (req, res) => {
  const query = parseListPublicJobVacanciesQuery(req.query || {});
  const data = await service.listPublicJobVacancies(query);
  return ok(res, data, "Public job vacancies fetched.");
});

const publicGetJobVacancy = asyncHandler(async (req, res) => {
  const data = await service.getPublicJobVacancyBySlug(req.params.slug);
  return ok(res, data, "Public job vacancy fetched.");
});

module.exports = {
  adminListJobVacancies,
  adminGetJobVacancy,
  adminCreateJobVacancy,
  adminUpdateJobVacancy,
  adminCloseJobVacancy,
  publicListJobVacancies,
  publicGetJobVacancy
};
