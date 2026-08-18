import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchPrintJobs, fetchPrintJob, moderatePrintJob, fetchPrintUploadPreviewUrl } from "./print-jobs.api";

function SafeZoneOverlay({ printTemplate, uploadSpec }) {
  const cardW = Number(uploadSpec?.cardWidthMm || 0);
  const cardH = Number(uploadSpec?.cardHeightMm || 0);
  if (!printTemplate || !cardW || !cardH) {
    return null;
  }

  return (
    <svg
      viewBox={`0 0 ${cardW} ${cardH}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      {printTemplate.holes.map((hole, i) => {
        const cx = hole.edge === "left" ? hole.distanceFromSideMm : cardW - hole.distanceFromSideMm;
        const cy = hole.distanceFromTopMm;
        const r = hole.diameterMm / 2;
        const rMargin = r + (hole.marginMm || 0);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={rMargin} fill="rgba(194,40,28,.18)" />
            <circle cx={cx} cy={cy} r={r} fill="#C2281C" stroke="#fff" strokeWidth={cardW / 200} />
          </g>
        );
      })}
    </svg>
  );
}

const DEFAULT_CROP = { panX: 0.5, panY: 0.5, zoom: 1 };

// Renders the exact same drag/zoom framing the buyer settled on in the
// storefront configurator (persisted server-side as upload.crop), instead
// of an admin-side center-crop that could show different content than what
// the buyer actually confirmed for print.
function JobPreview({ uploadId, crop, uploadSpec, printTemplate }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const frameRef = useRef(null);

  useEffect(() => {
    let objectUrl = "";
    setPreviewUrl("");
    setError("");
    setNaturalSize({ w: 0, h: 0 });
    if (!uploadId) return undefined;

    fetchPrintUploadPreviewUrl(uploadId)
      .then((url) => {
        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch((err) => setError(err.message || "Failed to load preview."));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uploadId]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setFrameSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const aspectRatio =
    uploadSpec?.cardWidthMm && uploadSpec?.cardHeightMm
      ? `${uploadSpec.cardWidthMm} / ${uploadSpec.cardHeightMm}`
      : "856 / 540";

  const activeCrop = crop || DEFAULT_CROP;
  const canPan = frameSize.w > 0 && frameSize.h > 0 && naturalSize.w > 0 && naturalSize.h > 0;
  let imgStyle = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
  if (canPan) {
    const baseScale = Math.max(frameSize.w / naturalSize.w, frameSize.h / naturalSize.h);
    const displayW = naturalSize.w * baseScale * activeCrop.zoom;
    const displayH = naturalSize.h * baseScale * activeCrop.zoom;
    const minLeft = frameSize.w - displayW;
    const minTop = frameSize.h - displayH;
    imgStyle = {
      position: "absolute",
      width: displayW,
      height: displayH,
      left: minLeft * activeCrop.panX,
      top: minTop * activeCrop.panY,
      maxWidth: "none",
      display: "block"
    };
  }

  return (
    <div
      ref={frameRef}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 280,
        aspectRatio,
        borderRadius: 8,
        overflow: "hidden",
        background: "#f3f1ee",
        boxShadow: "0 2px 8px rgba(0,0,0,.15)",
        margin: "0 auto"
      }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Uploaded design"
          style={imgStyle}
          onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        />
      ) : error ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 11, color: "var(--danger)", padding: 8, textAlign: "center" }}>{error}</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 11, color: "var(--muted)" }}>Loading...</div>
      )}
      <SafeZoneOverlay printTemplate={printTemplate} uploadSpec={uploadSpec} />
    </div>
  );
}

export function PrintJobsPage() {
  const { session } = useAuthSession();
  const canModerate = hasPermission(session, "print_jobs.moderate");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [jobs, setJobs] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPrintJobs(statusFilter ? { status: statusFilter } : {});
      setJobs(data);
      if (data.length && !selectedKey) {
        setSelectedKey(data[0].key);
      }
    } catch (apiError) {
      setError(apiError.message || "Failed to load print jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const selectedJob = useMemo(
    () => jobs.find((row) => row.key === selectedKey) || null,
    [jobs, selectedKey]
  );

  useEffect(() => {
    if (!selectedJob) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    fetchPrintJob(selectedJob.orderId, selectedJob.lineId)
      .then(setDetail)
      .catch((apiError) => setError(apiError.message || "Failed to load job detail."))
      .finally(() => setDetailLoading(false));
  }, [selectedJob?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const counts = { needs_review: 0, approved: 0, rejected: 0 };
    jobs.forEach((row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
    });
    return counts;
  }, [jobs]);

  async function handleModerate(action) {
    if (!selectedJob) return;
    let rejectionReason = "";
    if (action === "reject") {
      rejectionReason = window.prompt("Reason for rejecting this design (shown to the customer):", "") || "";
      if (!rejectionReason.trim()) return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await moderatePrintJob(selectedJob.orderId, selectedJob.lineId, { action, rejectionReason });
      setNotice(action === "approve" ? "Approved and queued for printing." : "Rejected — customer notified.");
      await bootstrap();
      const refreshed = await fetchPrintJob(selectedJob.orderId, selectedJob.lineId);
      setDetail(refreshed);
    } catch (apiError) {
      setError(apiError.message || "Failed to update print job.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading print jobs..." />;
  }

  if (error && !jobs.length) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Print Jobs"
        description="Every uploaded custom-print design, across all orders, reviewed here before it goes to print."
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Needs Review</p>
          <h3>{stats.needs_review || 0}</h3>
        </article>
        <article className="summary-card">
          <p>Approved</p>
          <h3>{stats.approved || 0}</h3>
        </article>
        <article className="summary-card">
          <p>Rejected</p>
          <h3>{stats.rejected || 0}</h3>
        </article>
      </div>

      {notice ? <p className="form-success">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="opt-group" style={{ marginBottom: 12 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }}>
          <option value="">All statuses</option>
          <option value="needs_review">Needs Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {!jobs.length ? (
        <EmptyBlock title="No print jobs." description="Custom-print orders will show up here once a customer uploads a design and pays." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(300px,1fr)", gap: 20, alignItems: "start" }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Product</th>
                  <th>Customer</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setSelectedKey(row.key)}
                    style={{
                      cursor: "pointer",
                      background: row.key === selectedKey ? "rgba(232,35,26,0.06)" : undefined
                    }}
                  >
                    <td>
                      {row.orderNo}
                      <div className="muted" style={{ fontSize: 11 }}>{formatDateTime(row.createdAt)}</div>
                    </td>
                    <td>{row.productTitle}</td>
                    <td>{row.customerName}</td>
                    <td>{row.qty}</td>
                    <td><StatusBadge value={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="summary-card">
            {detailLoading || !detail ? (
              <p className="muted">Loading job...</p>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15 }}>{detail.orderNo}</h3>
                    <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>{detail.customerName}</p>
                  </div>
                  <StatusBadge value={detail.status} />
                </div>

                {detail.uploads.map((upload) => (
                  <JobPreview
                    key={upload.id}
                    uploadId={upload.id}
                    crop={upload.crop}
                    uploadSpec={detail.uploadSpec}
                    printTemplate={detail.printTemplate}
                  />
                ))}

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                    Selected Options
                  </div>
                  {detail.customization.map((opt) => (
                    <div key={opt.groupId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                      <span className="muted">{opt.groupLabel}</span>
                      <b>{opt.choiceLabel}{opt.priceDelta ? ` (+₹${opt.priceDelta})` : ""}</b>
                    </div>
                  ))}
                </div>

                {detail.rejectionReason ? (
                  <p className="form-error" style={{ marginTop: 12 }}>Rejected: {detail.rejectionReason}</p>
                ) : null}

                {canModerate && detail.status === "needs_review" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleModerate("approve")}>
                      Approve &amp; queue for printing
                    </button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => handleModerate("reject")}>
                      Reject — request re-upload
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
