const REPORT_KEYS = Object.freeze([
  "sales",
  "invoices",
  "gst",
  "payments",
  "shipping",
  "dealer-sales",
  "product-sales",
  "city-pincode-orders",
  "abandoned-carts",
  "marketing-offers",
  "inventory"
]);

const REPORT_EXPORT_FORMATS = Object.freeze([
  "csv",
  "excel",
  "json",
  "pdf-summary",
  "invoice-zip",
  "tally-csv",
  "tally-xml"
]);

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

function serializeReportCsv(report) {
  const header = report.columns.map((column) => escapeCsv(column.label)).join(",");
  const rows = report.rows.map((row) =>
    report.columns.map((column) => escapeCsv(row[column.key])).join(",")
  );

  return [header, ...rows].join("\n");
}

function serializeReportExcelHtml(report) {
  const headCells = report.columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const bodyRows = report.rows
    .map((row) => {
      const cells = report.columns
        .map((column) => `<td>${escapeHtml(row[column.key])}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return [
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(report.title || "Report")}</title>`,
    "<style>",
    "body { font-family: Arial, sans-serif; }",
    "table { border-collapse: collapse; width: 100%; }",
    "th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }",
    "th { background: #f3f4f6; }",
    "</style>",
    "</head>",
    "<body>",
    `<h1>${escapeHtml(report.title || "Report")}</h1>`,
    "<table>",
    `<thead><tr>${headCells}</tr></thead>`,
    `<tbody>${bodyRows}</tbody>`,
    "</table>",
    "</body>",
    "</html>"
  ].join("");
}

module.exports = {
  REPORT_KEYS,
  REPORT_EXPORT_FORMATS,
  escapeXml,
  serializeReportCsv,
  serializeReportExcelHtml
};
