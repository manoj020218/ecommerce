const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readCatalogStore } = require("../../database/catalog-store");
const { readPrintStore, writePrintStore } = require("../../database/print-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { toPublicUploadRecord, sanitizeUploadRecord } = require("./print-uploads.model");

let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

const EXT_TO_FORMAT = { ".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".pdf": "pdf" };

function resolveFormat(file) {
  if (file.mimetype === "application/pdf") return "pdf";
  if (file.mimetype === "image/png") return "png";
  if (file.mimetype === "image/jpeg") return "jpg";
  return EXT_TO_FORMAT[path.extname(file.originalname).toLowerCase()] || "";
}

async function uploadPrintDesign({ file, productId, ownerType, ownerId }) {
  const catalogStore = await readCatalogStore();
  const product = ensureArray(catalogStore.products).find((row) => row.id === productId);
  if (!product) {
    throw new HttpError(404, "Product not found.");
  }
  if (product.fulfillmentType !== "custom_print") {
    throw new HttpError(400, "This product does not accept design uploads.");
  }

  const spec = product.uploadSpec || {};
  const format = resolveFormat(file);
  const allowedFormats = ensureArray(spec.allowedFormats).length
    ? spec.allowedFormats
    : ["jpg", "png", "pdf"];
  if (!allowedFormats.includes(format)) {
    throw new HttpError(
      400,
      `Unsupported file format. This product accepts: ${allowedFormats.join(", ").toUpperCase()}.`
    );
  }

  const maxBytes = Number(spec.maxFileSizeMb || 20) * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new HttpError(400, `File is larger than the ${spec.maxFileSizeMb || 20}MB limit.`);
  }

  let widthPx = null;
  let heightPx = null;
  let dimensionCheck = "unchecked"; // PDFs, or sharp unavailable -- flagged for manual review, never a hard failure

  if (format !== "pdf" && sharp) {
    try {
      const metadata = await sharp(file.path).metadata();
      widthPx = metadata.width || null;
      heightPx = metadata.height || null;

      const minW = Number(spec.minWidthPx || 0);
      const minH = Number(spec.minHeightPx || 0);
      if (widthPx && heightPx && (minW || minH) && (widthPx < minW || heightPx < minH)) {
        throw new HttpError(
          400,
          `Image resolution (${widthPx}x${heightPx}px) is below the minimum required (${minW}x${minH}px). Please upload a higher-resolution file.`
        );
      }
      dimensionCheck = "ok";
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Corrupt/unreadable image -- don't block the upload, flag for manual review instead.
      dimensionCheck = "unchecked";
    }
  }

  const record = {
    id: generateId("upload"),
    ownerType,
    ownerId,
    productId,
    storedFilename: path.basename(file.path),
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    widthPx,
    heightPx,
    dimensionCheck,
    createdAt: nowIso()
  };

  const store = await readPrintStore();
  store.uploads.push(record);
  await writePrintStore(store);

  await addActivityLog({
    action: "print_uploads.created",
    actorId: ownerId,
    actorRole: ownerType,
    resourceType: "print_upload",
    resourceId: record.id,
    metadata: { productId, dimensionCheck }
  });

  return toPublicUploadRecord(record);
}

// The buyer drags/zooms to choose which part of an oversized or
// wrong-aspect-ratio photo actually shows through the card cutout --
// persisted here (rather than only kept client-side) so the admin's Print
// Jobs review screen can render the exact same crop the buyer confirmed,
// instead of the operator guessing at framing from the raw uploaded file.
async function updateUploadCrop(uploadId, crop, { ownerType, ownerId }) {
  const store = await readPrintStore();
  const record = ensureArray(store.uploads).find((row) => row.id === uploadId);
  if (!record) {
    throw new HttpError(404, "Upload not found.");
  }
  if (record.ownerType !== ownerType || record.ownerId !== ownerId) {
    throw new HttpError(403, "You do not have access to this upload.");
  }

  record.crop = crop;
  await writePrintStore(store);

  return toPublicUploadRecord(record);
}

async function getUploadRecord(uploadId) {
  const store = await readPrintStore();
  const record = ensureArray(store.uploads).find((row) => row.id === uploadId);
  if (!record) {
    throw new HttpError(404, "Upload not found.");
  }
  return sanitizeUploadRecord(record);
}

async function listUploadsByIds(uploadIds) {
  const store = await readPrintStore();
  const idSet = new Set(ensureArray(uploadIds));
  return ensureArray(store.uploads)
    .filter((row) => idSet.has(row.id))
    .map(sanitizeUploadRecord);
}

module.exports = {
  uploadPrintDesign,
  updateUploadCrop,
  getUploadRecord,
  listUploadsByIds
};
