import { useEffect, useState } from "react";
import { Modal } from "../../shared/components/modal";
import { fetchShippingClasses, createShippingClass, updateShippingClass } from "./shipping.api";

const BRAND = "#E8231A";

const EMPTY_FORM = {
  name: "",
  code: "",
  description: "",
  rateType: "weight_based",
  fixedAmount: "",
  baseCharge: "",
  perKgRate: "",
  isActive: true
};

function toCodeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function inp(style) {
  return {
    width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb",
    borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box",
    ...style
  };
}

export function ShippingClassesTab({ canCreate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchShippingClasses();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load shipping classes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name || "",
      code: row.code || "",
      description: row.description || "",
      rateType: row.rateType || "weight_based",
      fixedAmount: row.fixedAmount ?? "",
      baseCharge: row.baseCharge ?? "",
      perKgRate: row.perKgRate ?? "",
      isActive: row.isActive !== false
    });
    setModal(true);
  }

  function onNameChange(e) {
    const name = e.target.value;
    setForm((f) => ({
      ...f,
      name,
      code: editing ? f.code : toCodeSlug(name)
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim(),
        rateType: form.rateType,
        fixedAmount: Number(form.fixedAmount || 0),
        baseCharge: Number(form.baseCharge || 0),
        perKgRate: Number(form.perKgRate || 0),
        isActive: form.isActive
      };
      if (editing) {
        await updateShippingClass(editing.id, payload);
        setNotice(`"${payload.name}" updated.`);
      } else {
        await createShippingClass(payload);
        setNotice(`"${payload.name}" created.`);
      }
      setModal(false);
      load();
    } catch (err) {
      setError(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" };
  const hintStyle = { fontSize: 11, color: "#9ca3af", marginTop: 3 };

  return (
    <div className="settings-card">
      <div className="settings-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3>Shipping Classes</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            Define how shipping cost is calculated per product — fixed flat rate or weight-based.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openAdd}
            style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            + Add Class
          </button>
        )}
      </div>

      {error ? <p style={{ color: BRAND, fontSize: 13, margin: "8px 0" }}>{error}</p> : null}
      {notice ? <p style={{ color: "#16a34a", fontSize: 13, margin: "8px 0" }}>{notice}</p> : null}

      {loading ? (
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 13 }}>No shipping classes yet. Add one to get started.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>Name</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>Code</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>Rate Type</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>Rate Details</th>
              <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>Active</th>
              {canCreate && <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>Edit</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                  <strong>{row.name}</strong>
                  {row.description ? <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{row.description}</div> : null}
                </td>
                <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                  <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{row.code}</code>
                </td>
                <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                  {row.rateType === "fixed" ? (
                    <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Fixed</span>
                  ) : (
                    <span style={{ background: "#f0fdf4", color: "#15803d", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Weight-Based</span>
                  )}
                </td>
                <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", fontSize: 12, color: "#374151" }}>
                  {row.rateType === "fixed"
                    ? `Flat ₹${row.fixedAmount}`
                    : (row.baseCharge || row.perKgRate)
                      ? `Base ₹${row.baseCharge} + ₹${row.perKgRate}/kg`
                      : "Uses rate card defaults"}
                </td>
                <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "center" }}>
                  <span style={{ color: row.isActive ? "#16a34a" : "#9ca3af", fontWeight: 600, fontSize: 12 }}>
                    {row.isActive ? "Yes" : "No"}
                  </span>
                </td>
                {canCreate && (
                  <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "center" }}>
                    <button
                      onClick={() => openEdit(row)}
                      style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer", color: "#374151" }}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <Modal onClose={() => setModal(false)} title={editing ? "Edit Shipping Class" : "New Shipping Class"}>
          <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={labelStyle}>Class Name *</label>
              <input style={inp()} value={form.name} onChange={onNameChange} placeholder="e.g. Heavy Equipment" required />
            </div>
            <div>
              <label style={labelStyle}>Code *</label>
              <input style={inp()} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. heavy_equipment" required />
              <div style={hintStyle}>Used as the product field value. Lowercase letters, digits, underscores only.</div>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input style={inp()} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div>
              <label style={labelStyle}>Rate Type *</label>
              <select style={inp()} value={form.rateType} onChange={(e) => setForm((f) => ({ ...f, rateType: e.target.value }))}>
                <option value="weight_based">Weight-Based (base charge + per kg rate)</option>
                <option value="fixed">Fixed (flat amount regardless of weight)</option>
              </select>
            </div>

            {form.rateType === "fixed" ? (
              <div>
                <label style={labelStyle}>Fixed Shipping Amount (₹) *</label>
                <input type="number" min="0" step="0.01" style={inp()} value={form.fixedAmount} onChange={(e) => setForm((f) => ({ ...f, fixedAmount: e.target.value }))} placeholder="e.g. 500" required />
                <div style={hintStyle}>Charged as a flat fee regardless of weight or destination zone.</div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Base Charge (₹)</label>
                    <input type="number" min="0" step="0.01" style={inp()} value={form.baseCharge} onChange={(e) => setForm((f) => ({ ...f, baseCharge: e.target.value }))} placeholder="0" />
                  </div>
                  <div>
                    <label style={labelStyle}>Per Kg Rate (₹)</label>
                    <input type="number" min="0" step="0.01" style={inp()} value={form.perKgRate} onChange={(e) => setForm((f) => ({ ...f, perKgRate: e.target.value }))} placeholder="0" />
                  </div>
                </div>
                <div style={hintStyle}>Leave both at 0 to use the default zone-based rate cards.</div>
              </>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Active (visible in product selector)
            </label>

            {error ? <p style={{ color: BRAND, fontSize: 13, margin: 0 }}>{error}</p> : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setModal(false)} style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Class"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
