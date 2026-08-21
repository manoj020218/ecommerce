const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { JOB_VACANCY_PERMISSIONS } = require("./job-vacancies.permissions");
const controller = require("./job-vacancies.controller");

function createAdminJobVacanciesRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(JOB_VACANCY_PERMISSIONS.VIEW),
    controller.adminListJobVacancies
  );
  router.get(
    "/:jobId",
    requireAdminPermission(JOB_VACANCY_PERMISSIONS.VIEW),
    controller.adminGetJobVacancy
  );
  router.post(
    "/",
    requireAdminPermission(JOB_VACANCY_PERMISSIONS.CREATE),
    controller.adminCreateJobVacancy
  );
  router.patch(
    "/:jobId",
    requireAdminPermission(JOB_VACANCY_PERMISSIONS.EDIT),
    controller.adminUpdateJobVacancy
  );
  router.delete(
    "/:jobId",
    requireAdminPermission(JOB_VACANCY_PERMISSIONS.DELETE),
    controller.adminCloseJobVacancy
  );

  return router;
}

function createPublicJobVacanciesRouter() {
  const router = express.Router();

  router.get("/", controller.publicListJobVacancies);
  router.get("/:slug", controller.publicGetJobVacancy);

  return router;
}

module.exports = { createAdminJobVacanciesRouter, createPublicJobVacanciesRouter };
