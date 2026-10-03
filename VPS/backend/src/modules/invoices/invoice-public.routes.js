const express = require("express");
const { isValidInvoiceSignature } = require("./invoice-links");

// GET /api/invoice-pdf/:invoiceId/:signature[?download=1]
// Public, signed link to an invoice PDF (2026-10-03) — used in emails,
// WhatsApp messages and the storefront download buttons.
function createPublicInvoicePdfRouter() {
  const router = express.Router();
  router.get("/:invoiceId/:signature", async (req, res) => {
    const { invoiceId, signature } = req.params;
    if (!isValidInvoiceSignature(invoiceId, signature)) {
      return res.status(404).type("text/plain").send("Invoice link is not valid.");
    }
    try {
      const { getInvoicePdf } = require("./invoices.service");
      const pdf = await getInvoicePdf(invoiceId);
      const disposition = req.query.download ? "attachment" : "inline";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${disposition}; filename="${pdf.fileName}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("X-Robots-Tag", "noindex");
      return res.send(pdf.buffer);
    } catch (error) {
      const status = error?.statusCode || error?.status || 500;
      return res.status(status === 404 ? 404 : 500).type("text/plain").send(status === 404 ? "Invoice not found." : "Could not create the invoice PDF. Please try again.");
    }
  });
  return router;
}

module.exports = { createPublicInvoicePdfRouter };
