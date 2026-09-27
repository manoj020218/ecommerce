import { useState } from "react";

// Spreadsheet paste is tab-separated; typed shorthand might use ":" or " - "
// as a label/value divider instead — tried in that order, first one that
// actually splits the line into 2+ parts wins.
function parseBulkSpecText(text) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    let parts = line.split("\t");
    if (parts.length < 2) parts = line.split(/\s*:\s*/);
    if (parts.length < 2) parts = line.split(/\s+-\s+/);
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join(" ").trim();
      if (key) rows.push({ key, value });
    }
  }

  return rows;
}

// Edits a plain {label: value} object -- the exact shape stored on the
// product and rendered as-is (Object.entries, in insertion order) by the
// buyer-facing "Specifications" tab on the product page. Replaces what used
// to be a raw JSON textarea: a stray comma or unmatched quote there failed
// the whole save with a JSON parse error instead of a normal field error.
export function SpecificationsEditor({ value, onChange }) {
  const [pasteText, setPasteText] = useState("");
  const rows = Object.entries(value || {}).map(([key, val]) => ({ key, value: String(val) }));

  const commitRows = (nextRows) => {
    const nextObj = {};
    nextRows.forEach(({ key, value: v }) => {
      if (key.trim()) {
        nextObj[key.trim()] = v;
      }
    });
    onChange(nextObj);
  };

  const updateRow = (index, field, nextValue) => {
    commitRows(rows.map((row, i) => (i === index ? { ...row, [field]: nextValue } : row)));
  };

  const removeRow = (index) => {
    commitRows(rows.filter((_, i) => i !== index));
  };

  const addRow = () => {
    commitRows([...rows, { key: "", value: "" }]);
  };

  const applyPaste = () => {
    const parsed = parseBulkSpecText(pasteText);
    if (parsed.length === 0) {
      return;
    }
    commitRows([...rows, ...parsed]);
    setPasteText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          No specifications added yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key -- rows have no stable id, index is fine for a purely local, always-fully-re-rendered list
            <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={row.key}
                onChange={(event) => updateRow(index, "key", event.target.value)}
                placeholder="Label (e.g. Material)"
                style={{
                  flex: "0 0 40%",
                  padding: "6px 8px",
                  fontSize: 13,
                  border: "1px solid var(--border)",
                  borderRadius: 6
                }}
              />
              <input
                value={row.value}
                onChange={(event) => updateRow(index, "value", event.target.value)}
                placeholder="Value (e.g. Stainless Steel)"
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: 13,
                  border: "1px solid var(--border)",
                  borderRadius: 6
                }}
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label="Remove specification"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--danger)",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="btn btn-secondary btn-small"
        style={{ alignSelf: "flex-start" }}
      >
        + Add Specification
      </button>

      <div style={{ marginTop: 4, padding: 10, border: "1px dashed var(--border)", borderRadius: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
          Paste from a spreadsheet
        </span>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 6px" }}>
          Paste rows copied from Excel/Google Sheets — one "Label, Value" per line — and they'll
          be added below as new rows.
        </p>
        <textarea
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          rows={3}
          placeholder={"Material\tStainless Steel\nVoltage\t12V"}
          style={{
            width: "100%",
            fontSize: 12,
            fontFamily: "monospace",
            padding: 8,
            border: "1px solid var(--border)",
            borderRadius: 6
          }}
        />
        <button
          type="button"
          onClick={applyPaste}
          disabled={!pasteText.trim()}
          className="btn btn-secondary btn-small"
          style={{ marginTop: 6 }}
        >
          Add Pasted Rows
        </button>
      </div>
    </div>
  );
}
