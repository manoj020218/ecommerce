function cloneDefaultPrintStore() {
  return { uploads: [], printJobStatuses: [] };
}

// Full record -- used internally and by the admin file-stream route (needs
// storedFilename/mimeType to actually serve the file).
function sanitizeUploadRecord(record) {
  return { ...record };
}

// What the uploader (buyer) gets back after POST /api/print-uploads --
// deliberately omits storedFilename (internal disk path detail) since the
// client never needs it, it only ever references the upload by id.
function toPublicUploadRecord(record) {
  return {
    id: record.id,
    originalName: record.originalName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    widthPx: record.widthPx || null,
    heightPx: record.heightPx || null,
    dimensionCheck: record.dimensionCheck || "unchecked",
    crop: record.crop || null,
    createdAt: record.createdAt
  };
}

module.exports = {
  cloneDefaultPrintStore,
  sanitizeUploadRecord,
  toPublicUploadRecord
};
