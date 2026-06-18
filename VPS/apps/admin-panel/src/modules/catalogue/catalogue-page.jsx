import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { formatDateTime, formatNumber } from "../../shared/utils/formatters";
import {
  exportCatalogueProducts,
  fetchCatalogueSummary,
  importProductsPlaceholder
} from "./catalogue.api";

const BRAND    = "#E8231A";
const BRAND_DK = "#C41D15";

function downloadJson(filename, payload) {
  const blob   = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href     = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ emoji, iconBg, value, label, sub }) {
  return (
    <div style={{
      background:"#fff", borderRadius:16, border:"1px solid #f3f4f6",
      padding:20, boxShadow:"0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{
          width:44, height:44, background:iconBg, borderRadius:12,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0
        }}>
          {emoji}
        </div>
      </div>
      <p style={{ fontSize:28, fontWeight:800, color:"#111827", margin:0, lineHeight:1 }}>
        {value ?? "—"}
      </p>
      <p style={{ fontSize:13, color:"#6b7280", margin:"4px 0 0", fontWeight:500 }}>{label}</p>
      {sub && <p style={{ fontSize:11, color:"#9ca3af", margin:"4px 0 0" }}>{sub}</p>}
    </div>
  );
}

// ── module tile ───────────────────────────────────────────────────────────────

function ModuleTile({ to, emoji, iconBg, title, description }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      style={{ textDecoration:"none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        background:"#fff", borderRadius:16, padding:20,
        border:`1px solid ${hovered ? BRAND : "#f3f4f6"}`,
        boxShadow: hovered ? `0 4px 16px rgba(232,35,26,0.12)` : "0 1px 3px rgba(0,0,0,0.06)",
        transition:"border-color 0.15s, box-shadow 0.15s",
        height:"100%", display:"flex", flexDirection:"column"
      }}>
        <div style={{
          width:44, height:44, background: hovered ? BRAND : iconBg,
          borderRadius:12, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:20, marginBottom:12,
          transition:"background 0.15s", flexShrink:0
        }}>
          {emoji}
        </div>
        <p style={{ margin:0, fontSize:14, fontWeight:700, color:"#111827" }}>{title}</p>
        <p style={{ margin:"4px 0 0", fontSize:12, color:"#9ca3af", lineHeight:1.5, flex:1 }}>
          {description}
        </p>
        <p style={{ margin:"12px 0 0", fontSize:12, fontWeight:600, color: hovered ? BRAND : "#9ca3af", transition:"color 0.15s" }}>
          Open →
        </p>
      </div>
    </Link>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function CataloguePage() {
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [notice, setNotice]         = useState("");
  const [busyAction, setBusyAction] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCatalogueSummary();
      setSummary(data);
    } catch (apiError) {
      setError(apiError.message || "Failed to load catalogue summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onExport = async (includeInactive) => {
    setBusyAction("export");
    setNotice("");
    try {
      const payload   = await exportCatalogueProducts(includeInactive);
      const suffix    = includeInactive ? "all" : "active";
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadJson(`catalogue-products-${suffix}-${timestamp}.json`, payload);
      setNotice(`Export ready: ${formatNumber(payload.count)} products at ${formatDateTime(payload.exportedAt)}`);
    } catch (apiError) {
      setError(apiError.message || "Export failed.");
    } finally {
      setBusyAction("");
    }
  };

  const onImportPlaceholder = async () => {
    setBusyAction("import");
    setNotice("");
    try {
      await importProductsPlaceholder();
    } catch (apiError) {
      setNotice(apiError.message || "Import workflow is placeholder and will be completed in Phase 4.");
    } finally {
      setBusyAction("");
    }
  };

  if (loading) return <LoadingBlock label="Loading catalogue summary…" />;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;

  const s = summary || {};

  return (
    <div style={{ padding:"20px 24px" }}>

      {/* ── header ── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:"#111827", margin:0 }}>Catalogue Overview</h1>
          <p style={{ fontSize:12, color:"#9ca3af", margin:"3px 0 0" }}>
            Products, categories, HSN tax master, and inventory at a glance
          </p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button
            type="button"
            disabled={busyAction.length > 0}
            onClick={() => onExport(false)}
            style={{
              display:"inline-flex", alignItems:"center", gap:6,
              background:"#fff", color:"#374151",
              fontSize:13, fontWeight:600, padding:"8px 16px",
              borderRadius:10, border:"1px solid #e5e7eb", cursor:"pointer",
              opacity: busyAction ? 0.6 : 1, transition:"all 0.15s"
            }}
            onMouseEnter={e => { if (!busyAction) e.currentTarget.style.borderColor = BRAND; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {busyAction === "export" ? "Exporting…" : "Export Active"}
          </button>
          <button
            type="button"
            disabled={busyAction.length > 0}
            onClick={() => onExport(true)}
            style={{
              display:"inline-flex", alignItems:"center", gap:6,
              background:"#fff", color:"#374151",
              fontSize:13, fontWeight:600, padding:"8px 16px",
              borderRadius:10, border:"1px solid #e5e7eb", cursor:"pointer",
              opacity: busyAction ? 0.6 : 1, transition:"all 0.15s"
            }}
            onMouseEnter={e => { if (!busyAction) e.currentTarget.style.borderColor = BRAND; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export All
          </button>
          <button
            type="button"
            disabled={busyAction.length > 0}
            onClick={onImportPlaceholder}
            style={{
              display:"inline-flex", alignItems:"center", gap:6,
              background:"#1f2937", color:"#fff",
              fontSize:13, fontWeight:600, padding:"8px 16px",
              borderRadius:10, border:"none", cursor:"pointer",
              opacity: busyAction ? 0.6 : 1, transition:"background 0.15s"
            }}
            onMouseEnter={e => { if (!busyAction) e.currentTarget.style.background = "#374151"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#1f2937"; }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"/>
            </svg>
            {busyAction === "import" ? "Checking…" : "Import Placeholder"}
          </button>
        </div>
      </div>

      {/* notice / error */}
      {notice && (
        <div style={{
          background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12,
          padding:"10px 16px", marginBottom:20, fontSize:13, color:"#15803d"
        }}>
          ✓ {notice}
        </div>
      )}

      {/* ── stats cards ── */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",
        gap:16, marginBottom:24
      }}>
        <StatCard
          emoji="📦"
          iconBg="#dbeafe"
          value={formatNumber(s.products?.total)}
          label="Total Products"
          sub={`Active: ${formatNumber(s.products?.active)}  ·  Inactive: ${formatNumber(s.products?.inactive)}`}
        />
        <StatCard
          emoji="🗂️"
          iconBg="#dcfce7"
          value={formatNumber(s.categories?.total)}
          label="Categories"
          sub={`Active: ${formatNumber(s.categories?.active)}  ·  Inactive: ${formatNumber(s.categories?.inactive)}`}
        />
        <StatCard
          emoji="🧾"
          iconBg="#fef3c7"
          value={formatNumber(s.hsnTax?.total)}
          label="HSN / Tax Records"
          sub={`Active: ${formatNumber(s.hsnTax?.active)}`}
        />
      </div>

      {/* ── module tiles ── */}
      <div style={{ marginBottom:8 }}>
        <h2 style={{ fontSize:15, fontWeight:700, color:"#111827", margin:"0 0 14px" }}>Manage</h2>
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",
          gap:16
        }}>
          <ModuleTile
            to="/products"
            emoji="📋"
            iconBg="#dbeafe"
            title="Products"
            description="Add, edit, and manage full product details — pricing, images, variants, GST."
          />
          <ModuleTile
            to="/categories"
            emoji="🗂️"
            iconBg="#dcfce7"
            title="Categories"
            description="Create and organise parent-child categories with active/inactive states."
          />
          <ModuleTile
            to="/hsn-tax"
            emoji="🧾"
            iconBg="#fef3c7"
            title="HSN / Tax"
            description="Maintain GST, CGST, SGST, IGST rates and effective date records."
          />
          <ModuleTile
            to="/inventory"
            emoji="📊"
            iconBg="#f3e8ff"
            title="Inventory"
            description="Track stock levels, reserved qty, low-stock alerts, and manual adjustments."
          />
        </div>
      </div>

    </div>
  );
}
