const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { env } = require("../../config/env");
const { jsonFileStore } = require("../../database/json-file-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  BRANDING_UPLOAD_ASSET_MAP,
  INVOICE_SETTINGS_UPLOAD_ASSET_MAP,
  buildPublicSettingsView,
  cloneDefaultSettingsDocument
} = require("./settings.model");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(target, patch) {
  const merged = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    const targetValue = merged[key];

    if (isPlainObject(value) && isPlainObject(targetValue)) {
      merged[key] = deepMerge(targetValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function stampMeta(document, actor) {
  return {
    ...document.meta,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "system"
  };
}

function ensureSettingsDocumentShape(document) {
  const defaults = cloneDefaultSettingsDocument();
  let changed = false;

  for (const [key, value] of Object.entries(defaults)) {
    if (document[key] === undefined) {
      document[key] = value;
      changed = true;
    }
  }

  return changed;
}

async function getAllSettings() {
  const settings = await jsonFileStore.readSettingsDocument();
  const changed = ensureSettingsDocumentShape(settings);

  if (changed) {
    await jsonFileStore.writeSettingsDocument(settings);
  }

  return settings;
}

async function getSettingsSection(sectionKey) {
  const settings = await getAllSettings();
  if (!settings[sectionKey]) {
    throw new HttpError(404, "Settings section not found.");
  }
  return settings[sectionKey];
}

async function updateSection(sectionKey, patch, actor) {
  const settings = await getAllSettings();

  if (!settings[sectionKey]) {
    throw new HttpError(404, "Settings section not found.");
  }

  settings[sectionKey] = deepMerge(settings[sectionKey], patch);
  settings.meta = stampMeta(settings, actor);

  await jsonFileStore.writeSettingsDocument(settings);
  await jsonFileStore.appendSettingsAuditLog({
    action: "settings.section.updated",
    sectionKey,
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    changedKeys: Object.keys(patch),
    timestamp: settings.meta.updatedAt
  });

  await addActivityLog({
    action: "settings.section.updated",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    resourceType: "settings",
    resourceId: sectionKey,
    metadata: {
      changedKeys: Object.keys(patch)
    }
  });

  return settings[sectionKey];
}

function buildPublicUploadUrl(fullFilePath) {
  const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);
  const relativeUploadPath = path
    .relative(uploadsRoot, fullFilePath)
    .replace(/\\/g, "/");

  return `${env.publicBaseUrl}/static/uploads/${relativeUploadPath}`;
}

async function saveBrandingAsset(assetKey, fullFilePath, actor) {
  const settings = await getAllSettings();
  const mappedField = BRANDING_UPLOAD_ASSET_MAP[assetKey];

  if (!mappedField) {
    throw new HttpError(400, "Unsupported branding asset key.");
  }

  const publicUrl = buildPublicUploadUrl(fullFilePath);

  if (mappedField === "defaultOgImageUrl") {
    settings.seoDefaults.defaultOgImageUrl = publicUrl;
  } else {
    settings.branding[mappedField] = publicUrl;
  }

  settings.meta = stampMeta(settings, actor);

  await jsonFileStore.writeSettingsDocument(settings);
  await jsonFileStore.appendSettingsAuditLog({
    action: "settings.branding.uploaded",
    assetKey,
    targetField: mappedField,
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    filePath: fullFilePath,
    timestamp: settings.meta.updatedAt
  });

  await addActivityLog({
    action: "settings.branding.uploaded",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    resourceType: "settings_branding",
    resourceId: assetKey,
    metadata: {
      targetField: mappedField
    }
  });

  return {
    assetKey,
    field: mappedField,
    url: publicUrl
  };
}

async function saveInvoiceAsset(assetKey, fullFilePath, actor) {
  const settings = await getAllSettings();
  const mappedField = INVOICE_SETTINGS_UPLOAD_ASSET_MAP[assetKey];

  if (!mappedField) {
    throw new HttpError(400, "Unsupported invoice settings asset key.");
  }

  const publicUrl = buildPublicUploadUrl(fullFilePath);
  settings.invoiceSettings[mappedField] = publicUrl;
  settings.meta = stampMeta(settings, actor);

  await jsonFileStore.writeSettingsDocument(settings);
  await jsonFileStore.appendSettingsAuditLog({
    action: "settings.invoice_asset.uploaded",
    assetKey,
    targetField: mappedField,
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    filePath: fullFilePath,
    timestamp: settings.meta.updatedAt
  });

  await addActivityLog({
    action: "settings.invoice_asset.uploaded",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    resourceType: "settings_invoice",
    resourceId: assetKey,
    metadata: {
      targetField: mappedField
    }
  });

  return {
    assetKey,
    field: mappedField,
    url: publicUrl
  };
}

async function saveHeroBannerImage(slideId, imageType, fullFilePath, actor) {
  if (!slideId) throw new HttpError(400, "slideId is required.");
  if (imageType !== "desktop" && imageType !== "mobile") {
    throw new HttpError(400, "imageType must be 'desktop' or 'mobile'.");
  }

  const settings = await getAllSettings();
  if (!settings.heroBanners) settings.heroBanners = { slides: [] };

  const slides = Array.isArray(settings.heroBanners.slides) ? settings.heroBanners.slides : [];
  let slide = slides.find((s) => s.id === slideId);
  if (!slide) {
    slide = { id: slideId, desktopImageUrl: "", mobileImageUrl: "", title: "", subtitle: "", linkUrl: "", linkLabel: "", isActive: true };
    slides.push(slide);
  }

  const publicUrl = buildPublicUploadUrl(fullFilePath);
  if (imageType === "desktop") slide.desktopImageUrl = publicUrl;
  else slide.mobileImageUrl = publicUrl;

  settings.heroBanners.slides = slides;
  settings.meta = stampMeta(settings, actor);
  await jsonFileStore.writeSettingsDocument(settings);

  await addActivityLog({
    action: "settings.hero_banner.image_uploaded",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    resourceType: "hero_banner",
    resourceId: slideId,
    metadata: { imageType }
  });

  return { slideId, imageType, url: publicUrl };
}

async function updateHeroBanners(slides, actor) {
  const settings = await getAllSettings();
  settings.heroBanners = { slides: Array.isArray(slides) ? slides : [] };
  settings.meta = stampMeta(settings, actor);
  await jsonFileStore.writeSettingsDocument(settings);

  await addActivityLog({
    action: "settings.hero_banners.updated",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    resourceType: "hero_banners",
    resourceId: "slides",
    metadata: { count: Array.isArray(slides) ? slides.length : 0 }
  });

  return settings.heroBanners;
}

async function getPublicSettingsBundle() {
  const settings = await getAllSettings();
  return buildPublicSettingsView(settings);
}

async function getPublicSettingsSection(sectionKey) {
  const bundle = await getPublicSettingsBundle();
  if (!bundle[sectionKey]) {
    throw new HttpError(404, "Public settings section not found.");
  }
  return bundle[sectionKey];
}

module.exports = {
  getAllSettings,
  getSettingsSection,
  updateSection,
  saveBrandingAsset,
  saveInvoiceAsset,
  saveHeroBannerImage,
  updateHeroBanners,
  getPublicSettingsBundle,
  getPublicSettingsSection
};
