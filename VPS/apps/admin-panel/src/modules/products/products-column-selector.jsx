import { useEffect, useRef, useState } from "react";

export const COLUMN_DEFS = [
  { key: "image",    label: "Image",              alwaysOn: true },
  { key: "name",     label: "Product Name",       alwaysOn: true },
  { key: "category", label: "Category",           editable: true },
  { key: "hsn",      label: "HSN",                editable: true },
  { key: "qty",      label: "Qty",                editable: true },
  { key: "price",    label: "Price",              editable: true },
  { key: "sku",      label: "SKU",                editable: false },
  { key: "active",   label: "Active",             alwaysOn: true },
  { key: "share",    label: "Share",              editable: false },
  { key: "actions",  label: "Edit/Clone/Archive", alwaysOn: true },
];

export const DEFAULT_COLS = new Set([
  "image", "name", "price", "sku", "active", "actions"
]);

const STORAGE_KEY = "jenix_products_cols_v1";

export function loadSavedCols() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(DEFAULT_COLS);
    const arr = JSON.parse(raw);
    // Always include alwaysOn columns
    const alwaysOn = COLUMN_DEFS.filter((c) => c.alwaysOn).map((c) => c.key);
    return new Set([...alwaysOn, ...arr]);
  } catch {
    return new Set(DEFAULT_COLS);
  }
}

export function saveCols(colSet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...colSet]));
  } catch {}
}

export function ProductsColumnSelector({ visibleColumns, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  const toggle = (key) => {
    const def = COLUMN_DEFS.find((c) => c.key === key);
    if (def?.alwaysOn) return;
    const next = new Set(visibleColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Always keep alwaysOn
    COLUMN_DEFS.filter((c) => c.alwaysOn).forEach((c) => next.add(c.key));
    onChange(next);
  };

  const toggledCount = COLUMN_DEFS.filter(
    (c) => !c.alwaysOn && visibleColumns.has(c.key)
  ).length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, fontWeight: 500, padding: "9px 14px",
          border: "1px solid #e5e7eb", borderRadius: 10,
          background: open ? "#f3f4f6" : "#fff", cursor: "pointer",
          color: "#374151", transition: "background 0.1s"
        }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        Columns
        {toggledCount > 0 && (
          <span style={{
            background: "#E8231A", color: "#fff", borderRadius: 99,
            padding: "1px 6px", fontSize: 11, fontWeight: 700
          }}>{toggledCount}</span>
        )}
        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "8px 0", minWidth: 200
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase",
            letterSpacing: "0.5px", padding: "4px 16px 8px", margin: 0 }}>
            Toggle columns
          </p>
          {COLUMN_DEFS.map((col) => (
            <label
              key={col.key}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 16px", cursor: col.alwaysOn ? "default" : "pointer",
                opacity: col.alwaysOn ? 0.5 : 1,
                background: "transparent", transition: "background 0.1s"
              }}
              onMouseEnter={(e) => { if (!col.alwaysOn) e.currentTarget.style.background = "#f9fafb"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <input
                type="checkbox"
                checked={visibleColumns.has(col.key)}
                onChange={() => toggle(col.key)}
                disabled={col.alwaysOn}
                style={{ accentColor: "#E8231A", cursor: col.alwaysOn ? "default" : "pointer" }}
              />
              <span style={{ fontSize: 13, color: "#374151" }}>{col.label}</span>
              {col.editable && (
                <span style={{
                  marginLeft: "auto", fontSize: 10, color: "#16a34a",
                  background: "#dcfce7", padding: "1px 6px", borderRadius: 4, fontWeight: 600
                }}>editable</span>
              )}
              {col.alwaysOn && (
                <span style={{
                  marginLeft: "auto", fontSize: 10, color: "#9ca3af",
                  background: "#f3f4f6", padding: "1px 6px", borderRadius: 4
                }}>always</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
