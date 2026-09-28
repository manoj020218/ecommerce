// Bulk invoice PDF export (2026-09-28): turns each invoice's HTML (the same
// HTML the Invoices page downloads) into an A4 PDF in the browser and saves
// them as <invoice number>.pdf — into a folder the admin picks (Chrome /
// Edge), or as one ZIP file on browsers without folder access.
// PDFs are made here, not on the server, so the VPS does no extra work.

import { apiFetch } from "../../shared/api/http-client";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 6;
const RENDER_WIDTH_PX = 900; // wider than the template's 720px mobile breakpoint

export function canPickFolder() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

// Must be called straight from the button click (browsers require a user gesture).
export async function pickFolder() {
  return window.showDirectoryPicker({ id: "jenix-invoices", mode: "readwrite", startIn: "downloads" });
}

export function safeFileName(name) {
  return String(name || "invoice").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "invoice";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries once or twice if the API rate limit (300 requests/min) is hit.
async function fetchWithRetry(path) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await apiFetch(path);
    } catch (error) {
      if (error?.status === 429 && attempt < 3) { await sleep(20000); continue; }
      throw error;
    }
  }
}

export async function listInvoicesForRange({ dateFrom, dateTo, includeProforma }) {
  const query = new URLSearchParams({ limit: "5000" });
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const rows = await fetchWithRetry(`/admin/invoices?${query.toString()}`);
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((row) => includeProforma || (row.documentType || "tax_invoice") !== "proforma_invoice")
    .sort((a, b) => String(a.invoiceNumber).localeCompare(String(b.invoiceNumber), undefined, { numeric: true }));
}

function renderInIframe(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_WIDTH_PX}px;height:1200px;border:0;visibility:hidden;`;
    const timer = setTimeout(() => { iframe.remove(); reject(new Error("Invoice took too long to render.")); }, 30000);
    iframe.onload = async () => {
      try {
        const doc = iframe.contentDocument;
        const style = doc.createElement("style");
        style.textContent = "body{background:#fff!important;padding:0!important;margin:0!important}.paper{border:0!important;max-width:none!important}";
        doc.head.appendChild(style);
        await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
        if (doc.fonts?.ready) await doc.fonts.ready;
        clearTimeout(timer);
        resolve(iframe);
      } catch (error) { clearTimeout(timer); iframe.remove(); reject(error); }
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

async function htmlToPdfBytes(html) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const iframe = await renderInIframe(html);
  try {
    const doc = iframe.contentDocument;
    const target = doc.querySelector(".paper") || doc.body;
    const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: RENDER_WIDTH_PX });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const contentWidth = A4_WIDTH_MM - MARGIN_MM * 2;
    const pageContentHeight = A4_HEIGHT_MM - MARGIN_MM * 2;
    const imageHeight = (canvas.height * contentWidth) / canvas.width;
    const image = canvas.toDataURL("image/jpeg", 0.9);
    // Long invoices continue on the next page(s).
    let offset = 0;
    do {
      if (offset > 0) pdf.addPage();
      pdf.addImage(image, "JPEG", MARGIN_MM, MARGIN_MM - offset, contentWidth, imageHeight, undefined, "FAST");
      offset += pageContentHeight;
    } while (offset < imageHeight - 1);
    return new Uint8Array(pdf.output("arraybuffer"));
  } finally {
    iframe.remove();
  }
}

// Main entry. `folder` = a directory handle from pickFolder(), or null to
// build a ZIP instead. onProgress({ done, total, current }).
export async function exportInvoicePdfs({ invoices, folder, folderName, onProgress, shouldStop }) {
  const usedNames = new Set();
  const zipFiles = {};
  const failed = [];
  let saved = 0;
  let target = folder;
  if (folder && folderName) target = await folder.getDirectoryHandle(safeFileName(folderName), { create: true });

  for (let i = 0; i < invoices.length; i += 1) {
    if (shouldStop?.()) break;
    const invoice = invoices[i];
    onProgress?.({ done: i, total: invoices.length, current: invoice.invoiceNumber });
    try {
      const download = await fetchWithRetry(`/admin/invoices/${invoice.id}/download`);
      const bytes = await htmlToPdfBytes(download?.content || "");
      let base = safeFileName(invoice.invoiceNumber);
      for (let n = 2; usedNames.has(base.toLowerCase()); n += 1) base = `${safeFileName(invoice.invoiceNumber)} (${n})`;
      usedNames.add(base.toLowerCase());
      if (target) {
        const handle = await target.getFileHandle(`${base}.pdf`, { create: true });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
      } else {
        zipFiles[`${base}.pdf`] = bytes;
      }
      saved += 1;
    } catch (error) {
      failed.push({ invoiceNumber: invoice.invoiceNumber, message: error?.message || "Failed" });
    }
  }
  onProgress?.({ done: invoices.length, total: invoices.length, current: "" });

  if (!target && Object.keys(zipFiles).length) {
    const { zipSync } = await import("fflate");
    const zipped = zipSync(zipFiles, { level: 0 }); // PDFs are already compressed
    const url = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(folderName || "invoices")}.zip`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return { saved, failed };
}
