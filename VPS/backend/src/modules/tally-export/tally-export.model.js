const TALLY_EXPORT_PERIODS = Object.freeze({
  MONTHLY: "monthly",
  YEARLY: "yearly"
});

function sanitizeTallyExportLog(entry) {
  return {
    id: entry.id,
    dateFrom: entry.dateFrom || null,
    dateTo: entry.dateTo || null,
    period: entry.period,
    rowCount: Number(entry.rowCount || 0),
    generatedAt: entry.generatedAt || null,
    generatedBy: entry.generatedBy || "system"
  };
}

module.exports = {
  TALLY_EXPORT_PERIODS,
  sanitizeTallyExportLog
};
