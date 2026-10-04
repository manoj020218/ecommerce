// Admin → Projects: page visits for one project (2026-10-04).
// visits = { trackingSince, today, last7Days, last30Days, total, visitors,
//            enquiriesSinceTracking, conversionPct } from GET /admin/projects.

function fmtDay(day) {
  if (!day) return "";
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Stat({ label, value, strong }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {label} <b style={{ color: strong ? "#111827" : "#374151" }}>{Number(value || 0).toLocaleString("en-IN")}</b>
    </span>
  );
}

export function ProjectVisitsLine({ visits }) {
  if (!visits) return null;
  const sep = <span style={{ color: "#d1d5db" }}> · </span>;
  return (
    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}>
      <span style={{ fontWeight: 700, color: "#1d4ed8", marginRight: 4 }}>Visits</span>
      <Stat label="today" value={visits.today} strong />{sep}
      <Stat label="7 days" value={visits.last7Days} />{sep}
      <Stat label="30 days" value={visits.last30Days} />{sep}
      <span style={{ whiteSpace: "nowrap" }}>
        {visits.trackingSince ? `since ${fmtDay(visits.trackingSince)}` : "total"}{" "}
        <b style={{ color: "#374151" }}>{Number(visits.total || 0).toLocaleString("en-IN")}</b>
        {" "}({Number(visits.visitors || 0).toLocaleString("en-IN")} visitors → {visits.enquiriesSinceTracking || 0} enquiries
        {visits.conversionPct !== null && visits.conversionPct !== undefined ? `, ${visits.conversionPct}%` : ""})
      </span>
    </div>
  );
}
