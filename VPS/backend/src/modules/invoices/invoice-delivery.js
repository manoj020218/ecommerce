// Invoice PDF for buyer messages (2026-10-03): email attachment + WhatsApp
// document + a download link. Best-effort — if the PDF can't be made the
// message still goes out without it.

const { buildInvoicePdfUrl } = require("./invoice-links");

async function buildInvoiceForMessages(invoiceId) {
  if (!invoiceId) return { url: "", emailAttachments: undefined, whatsappDocument: undefined };
  const url = buildInvoicePdfUrl(invoiceId);
  try {
    const { getInvoicePdf } = require("./invoices.service");
    const pdf = await getInvoicePdf(invoiceId);
    return {
      url,
      invoiceNumber: pdf.invoiceNumber,
      emailAttachments: [{ filename: pdf.fileName, content: pdf.buffer, contentType: pdf.contentType }],
      whatsappDocument: {
        buffer: pdf.buffer,
        fileName: pdf.fileName,
        mimetype: pdf.contentType,
        caption: `Invoice ${pdf.invoiceNumber || ""} — download any time: ${url}`.trim()
      }
    };
  } catch (_error) {
    return { url, emailAttachments: undefined, whatsappDocument: undefined };
  }
}

module.exports = { buildInvoiceForMessages };
