import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchPaymentGateways, updateDirectPaymentDiscount } from "../payment-gateways/payment-gateways.api";

export function DiscountsPage() {
  const { session } = useAuthSession();
  const canManage = hasPermission(session, "payments.verify_manual");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gateways, setGateways] = useState([]);
  const [discountForm, setDiscountForm] = useState({
    enabled: false,
    percent: "0",
    applicableMethods: []
  });

  const manualGateways = useMemo(
    () => gateways.filter((g) => g.gatewayType === "manual"),
    [gateways]
  );

  const load = async () => {
    const data = await fetchPaymentGateways();
    const rows = Array.isArray(data?.gateways) ? data.gateways : [];
    const discount = data?.directPaymentDiscount || {};
    setGateways(rows);
    setDiscountForm({
      enabled: Boolean(discount.enabled),
      percent: String(discount.percent ?? 0),
      applicableMethods: Array.isArray(discount.applicableMethods)
        ? discount.applicableMethods
        : []
    });
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await load(); }
      catch (err) { setError(err.message || "Failed to load."); }
      finally { setLoading(false); }
    })();
  }, []);

  const onToggleMethod = (code) => {
    setDiscountForm((cur) => ({
      ...cur,
      applicableMethods: cur.applicableMethods.includes(code)
        ? cur.applicableMethods.filter((c) => c !== code)
        : [...cur.applicableMethods, code]
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateDirectPaymentDiscount({
        enabled: discountForm.enabled,
        percent: Number(discountForm.percent || 0),
        applicableMethods: discountForm.applicableMethods
      });
      await load();
      setNotice("Direct payment discount updated.");
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading..." />;

  return (
    <section className="stack">
      <PageHeader
        title="Discounts & Coupons"
        subtitle="Configure direct payment discounts and promotions for your store"
      />

      {notice && <p className="alert-info">{notice}</p>}
      {error && <ErrorBlock message={error} />}

      {/* ── Direct Payment Discount ── */}
      <div className="summary-card">
        <div style={{ marginBottom: 16 }}>
          <h3 className="subsection-title" style={{ margin: 0 }}>Direct Payment Discount</h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Offer a discount to buyers who pay via bank transfer or UPI directly — saving them PG charges.
          </p>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <div className="form-grid wide">
            <div className="field">
              <span>Status</span>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={discountForm.enabled}
                  disabled={!canManage}
                  onChange={(e) => setDiscountForm((c) => ({ ...c, enabled: e.target.checked }))}
                />
                <span>Enable direct payment discount</span>
              </label>
            </div>

            <label className="field">
              <span>Discount Percent (%)</span>
              <input
                type="number" min="0" max="50" step="0.1"
                value={discountForm.percent}
                disabled={!canManage}
                onChange={(e) => setDiscountForm((c) => ({ ...c, percent: e.target.value }))}
              />
            </label>

            <div className="field field-full">
              <span>Apply to these manual payment methods</span>
              <div className="stack" style={{ marginTop: 8 }}>
                {manualGateways.length === 0 && (
                  <p className="muted" style={{ fontSize: 13 }}>No manual payment methods configured yet.</p>
                )}
                {manualGateways.map((gw) => (
                  <label key={gw.code} className="inline-check">
                    <input
                      type="checkbox"
                      checked={discountForm.applicableMethods.includes(gw.code)}
                      disabled={!canManage}
                      onChange={() => onToggleMethod(gw.code)}
                    />
                    <span>{gw.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {canManage && (
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save Discount Settings"}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* ── Coupon Codes (placeholder) ── */}
      <div className="summary-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: "var(--bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, border: "1px solid var(--border)", flexShrink: 0
          }}>🎟️</div>
          <div>
            <h3 className="subsection-title" style={{ margin: 0 }}>Coupon Codes</h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Create and manage discount codes for promotions, seasonal offers, and B2B deals.
              <span style={{ marginLeft: 8, background: "var(--brand)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                Coming Soon
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
