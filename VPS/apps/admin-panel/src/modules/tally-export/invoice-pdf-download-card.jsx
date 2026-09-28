import { useRef, useState } from "react";
import { canPickFolder, exportInvoicePdfs, listInvoicesForRange, pickFolder } from "./invoice-pdf-export";

// "Download all invoices as PDF" card on the Tally Export page (2026-09-28).
// Each invoice is saved as <invoice number>.pdf in one folder.

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InvoicePdfDownloadCard() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [includeProforma, setIncludeProforma] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const stopRef = useRef(false);
  const folderMode = canPickFolder();

  const onDownload = async () => {
    setError(""); setResult(null); stopRef.current = false;
    let folder = null;
    if (folderMode) {
      try { folder = await pickFolder(); } catch (e) { if (e?.name === "AbortError") return; setError(e?.message || "Could not open the folder."); return; }
    }
    setBusy(true);
    try {
      const invoices = await listInvoicesForRange({ dateFrom, dateTo, includeProforma });
      if (!invoices.length) { setError("No invoices found in this date range."); return; }
      setProgress({ done: 0, total: invoices.length, current: "" });
      const res = await exportInvoicePdfs({
        invoices,
        folder,
        folderName: `Invoices ${dateFrom || "start"} to ${dateTo || "today"}`,
        onProgress: setProgress,
        shouldStop: () => stopRef.current
      });
      setResult({ ...res, total: invoices.length, stopped: stopRef.current, folderName: folder?.name || "" });
    } catch (e) {
      setError(e?.message || "Download failed.");
    } finally {
      setBusy(false);
    }
  };

  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="summary-card">
      <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 4 }}>⬇ Download all invoices as PDF</div>
      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, marginBottom: 12, textTransform: "none", letterSpacing: 0 }}>
        {folderMode
          ? "Choose a folder on your PC — every invoice in the date range is saved there as a PDF named by its invoice number (inside a sub-folder for the date range)."
          : "Your browser can't save into a folder directly, so the PDFs (named by invoice number) will download as one ZIP file — extract it to get the folder. Use Chrome or Edge to save straight into a folder."}
      </div>
      <div className="form-grid wide">
        <label className="field">
          <span>Date From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} disabled={busy} />
        </label>
        <label className="field">
          <span>Date To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} disabled={busy} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", alignSelf: "end", paddingBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={includeProforma} onChange={(e) => setIncludeProforma(e.target.checked)} disabled={busy} style={{ width: 16, height: 16 }} />
          Include proforma invoices
        </label>
        <div className="form-actions">
          {!busy ? (
            <button type="button" className="btn btn-primary" onClick={onDownload}>
              ⬇ Download PDFs
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => { stopRef.current = true; }}>
              Stop
            </button>
          )}
        </div>
      </div>

      {busy && progress ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 8, background: "#eef0f3", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#E8231A", transition: "width .2s" }} />
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {progress.done} of {progress.total} done{progress.current ? ` · making ${progress.current}.pdf` : ""} — keep this tab open.
          </p>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {result ? (
        <p className={result.failed.length ? "form-error" : "alert-info"}>
          {result.stopped ? "Stopped. " : ""}
          Saved {result.saved} of {result.total} invoice PDFs{result.folderName ? ` in "${result.folderName}"` : " (ZIP downloaded)"}.
          {result.failed.length ? ` Failed: ${result.failed.map((f) => f.invoiceNumber).join(", ")}.` : ""}
        </p>
      ) : null}
    </section>
  );
}
