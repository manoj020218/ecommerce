const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  ensurePermission,
  SETTINGS_PERMISSIONS
} = require("../settings/settings.permissions");
const controller = require("./setup-wizard.controller");

function createPublicSetupWizardRouter() {
  const router = express.Router();

  router.get("/bootstrap", controller.publicGetSetupWizardBootstrap);

  return router;
}

function createAdminSetupWizardRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);
  router.use(ensurePermission(SETTINGS_PERMISSIONS.VIEW));

  router.get("/", controller.adminGetSetupWizard);
  router.put(
    "/steps/:stepKey",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    controller.adminSaveSetupWizardStep
  );
  router.post(
    "/complete",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    controller.adminCompleteSetupWizard
  );

  return router;
}

module.exports = {
  createPublicSetupWizardRouter,
  createAdminSetupWizardRouter
};
