import { apiFetch } from "../../shared/api/http-client";

// multipart upload -- apiFetch's JSON.stringify path only kicks in for
// plain objects, FormData bodies pass through untouched (see http-client.js).
export function uploadPrintDesign(file, productId) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("productId", productId);
  return apiFetch("/print-uploads", {
    method: "POST",
    auth: true,
    body: formData
  });
}

export function updateUploadCrop(uploadId, crop) {
  return apiFetch(`/print-uploads/${uploadId}/crop`, {
    method: "PATCH",
    auth: true,
    body: crop
  });
}
