const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const settingsService = require("./settings.service");
const {
  parseStoreProfilePatch,
  parseBrandingPatch,
  parseSeoDefaultsPatch,
  parseReviewSettingsPatch,
  parseContactInformationPatch,
  parseCustomCodePatch,
  parseInvoiceSettingsPatch,
  parseAdminSectionParam
} = require("./settings.validator");

function wrapZodError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", {
      issues: error.issues
    });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(wrapZodError(error));
    }
  };
}

const adminGetAllSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.getAllSettings();
  return ok(res, data, "Settings fetched.");
});

const adminGetSettingsSection = asyncHandler(async (req, res) => {
  const sectionKey = parseAdminSectionParam(req.params.section);
  const data = await settingsService.getSettingsSection(sectionKey);
  return ok(res, data, "Settings section fetched.");
});

const adminUpdateStoreProfile = asyncHandler(async (req, res) => {
  const patch = parseStoreProfilePatch(req.body);
  const data = await settingsService.updateSection("storeProfile", patch, req.actor);
  return ok(res, data, "Store profile updated.");
});

const adminUpdateBranding = asyncHandler(async (req, res) => {
  const patch = parseBrandingPatch(req.body);
  const data = await settingsService.updateSection("branding", patch, req.actor);
  return ok(res, data, "Branding updated.");
});

const adminUpdateSeoDefaults = asyncHandler(async (req, res) => {
  const patch = parseSeoDefaultsPatch(req.body);
  const data = await settingsService.updateSection("seoDefaults", patch, req.actor);
  return ok(res, data, "SEO defaults updated.");
});

const adminUpdateReviewSettings = asyncHandler(async (req, res) => {
  const patch = parseReviewSettingsPatch(req.body);
  const data = await settingsService.updateSection("reviewSettings", patch, req.actor);
  return ok(res, data, "Review settings updated.");
});

const adminUpdateContactInformation = asyncHandler(async (req, res) => {
  const patch = parseContactInformationPatch(req.body);
  const data = await settingsService.updateSection(
    "contactInformation",
    patch,
    req.actor
  );
  return ok(res, data, "Contact information updated.");
});

const adminUpdateCustomCode = asyncHandler(async (req, res) => {
  const patch = parseCustomCodePatch(req.body);
  const data = await settingsService.updateSection("customCodeTags", patch, req.actor);
  return ok(res, data, "Custom code/tags updated.");
});

const adminUpdateInvoiceSettings = asyncHandler(async (req, res) => {
  const patch = parseInvoiceSettingsPatch(req.body);
  const data = await settingsService.updateSection("invoiceSettings", patch, req.actor);
  return ok(res, data, "Invoice settings updated.");
});

const adminUploadBrandingAsset = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.path) {
    throw new HttpError(400, "File upload is required with field name `file`.");
  }

  const data = await settingsService.saveBrandingAsset(
    req.params.assetKey,
    req.file.path,
    req.actor
  );

  return created(res, data, "Branding asset uploaded.");
});

const adminUploadInvoiceAsset = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.path) {
    throw new HttpError(400, "File upload is required with field name `file`.");
  }

  const data = await settingsService.saveInvoiceAsset(
    req.params.assetKey,
    req.file.path,
    req.actor
  );

  return created(res, data, "Invoice asset uploaded.");
});

const adminGetHeroBanners = asyncHandler(async (req, res) => {
  const settings = await settingsService.getAllSettings();
  return ok(res, settings.heroBanners || { slides: [] }, "Hero banners fetched.");
});

const adminUpdateHeroBanners = asyncHandler(async (req, res) => {
  const { slides } = req.body;
  if (!Array.isArray(slides)) throw new HttpError(400, "slides must be an array.");
  const data = await settingsService.updateHeroBanners(slides, req.actor);
  return ok(res, data, "Hero banners updated.");
});

const adminUploadHeroBannerImage = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.path) {
    throw new HttpError(400, "File upload is required with field name `file`.");
  }
  const { slideId, imageType } = req.params;
  const data = await settingsService.saveHeroBannerImage(slideId, imageType, req.file.path, req.actor);
  return created(res, data, "Banner image uploaded.");
});

const publicGetSettingsBootstrap = asyncHandler(async (_req, res) => {
  const data = await settingsService.getPublicSettingsBundle();
  return ok(res, data, "Public settings fetched.");
});

const publicGetStoreProfile = asyncHandler(async (_req, res) => {
  const data = await settingsService.getPublicSettingsSection("storeProfile");
  return ok(res, data, "Public store profile fetched.");
});

const publicGetBranding = asyncHandler(async (_req, res) => {
  const data = await settingsService.getPublicSettingsSection("branding");
  return ok(res, data, "Public branding fetched.");
});

const publicGetSeoDefaults = asyncHandler(async (_req, res) => {
  const data = await settingsService.getPublicSettingsSection("seoDefaults");
  return ok(res, data, "Public SEO defaults fetched.");
});

const publicGetContactInformation = asyncHandler(async (_req, res) => {
  const data = await settingsService.getPublicSettingsSection("contactInformation");
  return ok(res, data, "Public contact information fetched.");
});

module.exports = {
  adminGetAllSettings,
  adminGetSettingsSection,
  adminUpdateStoreProfile,
  adminUpdateBranding,
  adminUpdateSeoDefaults,
  adminUpdateReviewSettings,
  adminUpdateContactInformation,
  adminUpdateCustomCode,
  adminUpdateInvoiceSettings,
  adminUploadBrandingAsset,
  adminUploadInvoiceAsset,
  adminGetHeroBanners,
  adminUpdateHeroBanners,
  adminUploadHeroBannerImage,
  publicGetSettingsBootstrap,
  publicGetStoreProfile,
  publicGetBranding,
  publicGetSeoDefaults,
  publicGetContactInformation
};
