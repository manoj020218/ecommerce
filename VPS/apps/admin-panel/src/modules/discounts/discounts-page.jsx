import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchPaymentGateways, updateDirectPaymentDiscount, updateMdrCharges } from "../payment-gateways/payment-gateways.api";

const MDR_METHOD_ROWS = [
  { key: "manual_upi", label: "UPI (manual/store QR)" },
  { key: "online", label: "Payment Gateway (online)" },
  { key: "direct_bank_transfer", label: "Bank Transfer (NEFT/RTGS/IMPS)" }
];

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
  const [mdrSaving, setMdrSaving] = useState(false);
  const [mdrNotice, setMdrNotice] = useState("");
  const [mdrError, setMdrError] = useState("");
  const [mdrForm, setMdrForm] = useState({
    enabled: false,
    rates: {
      manual_upi: { percent: "0", gstPercent: "18" },
      online: { percent: "0", gstPercent: "18" },
      direct_bank_transfer: { percent: "0", gstPercent: "18" }
    }
  });

  const manualGateways = useMemo(
    () => gateways.filter((g) => g.gatewayType === "manual"),
    [gateways]
  );

  const load = async () => {
    const data = await fetchPaymentGateways();
    const rows = Array.isArray(data?.gateways) ? data.gateways : [];
    const discount = data?.directPaymentDiscount || {};
    const mdrCharges = data?.mdrCharges || {};
    setGateways(rows);
    setDiscountForm({
      enabled: Boolean(discount.enabled),
      percent: String(discount.percent ?? 0),
      applicableMethods: Array.isArray(discount.applicableMethods)
        ? discount.applicableMethods
        : []
    });
    setMdrForm((cur) => ({
      enabled: Boolean(mdrCharges.enabled),
      rates: MDR_METHOD_ROWS.reduce((acc, row) => {
        const rate = mdrCharges.rates?.[row.key] || {};
        acc[row.key] = {
          percent: String(rate.percent ?? cur.rates[row.key].percent),
          gstPercent: String(rate.gstPercent ?? cur.rates[row.key].gstPercent)
        };
        return acc;
      }, {})
    }));
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

  const onMdrRateChange = (key, field, value) => {
    setMdrForm((cur) => ({
      ...cur,
      rates: { ...cur.rates, [key]: { ...cur.rates[key], [field]: value } }
    }));
  };

  const onMdrSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    setMdrSaving(true);
    setMdrError("");
    setMdrNotice("");
    try {
      await updateMdrCharges({
        enabled: mdrForm.enabled,
        rates: MDR_METHOD_ROWS.reduce((acc, row) => {
          acc[row.key] = {
            percent: Number(mdrForm.rates[row.key].percent || 0),
            gstPercent: Number(mdrForm.rates[row.key].gstPercent || 0)
          };
          return acc;
        }, {})
      });
      await load();
      setMdrNotice("Payment processing charges updated.");
      setTimeout(() => setMdrNotice(""), 3000);
    } catch (err) {
      setMdrError(err.message || "Failed to save.");
    } finally {
      setMdrSaving(false);
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

      {/* ── Payment Processing Charges (MDR) ── */}
      <div className="summary-card">
        <div style={{ marginBottom: 16 }}>
          <h3 className="subsection-title" style={{ margin: 0 }}>Payment Processing Charges (MDR)</h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Instead of a discount, transparently add the actual payment-processing cost
            (MDR) plus GST on it, per payment method — shown to the buyer at checkout as
            an add-on, not baked into the price. Set 0% for a method that costs nothing
            to process (e.g. NEFT/RTGS/IMPS). Rates below can be configured and saved
            ahead of time — the toggle controls whether they actually apply to buyers yet.
          </p>
        </div>

        {mdrNotice && <p className="alert-info">{mdrNotice}</p>}
        {mdrError && <ErrorBlock message={mdrError} />}

        <form className="stack" onSubmit={onMdrSubmit}>
          <div className="field">
            <span>Status</span>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={mdrForm.enabled}
                disabled={!canManage}
                onChange={(e) => setMdrForm((c) => ({ ...c, enabled: e.target.checked }))}
              />
              <span>Expose Payment MDR to Buyer</span>
            </label>
            <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
              While off, no MDR/GST-on-MDR is added anywhere (checkout, invoices, walk-in
              orders) — buyers see today's pricing unchanged. Turn this on when ready to
              start charging it.
            </span>
          </div>

          <div className="stack" style={{ marginTop: 8 }}>
            {MDR_METHOD_ROWS.map((row) => (
              <div key={row.key} className="form-grid wide">
                <div className="field field-full">
                  <span style={{ fontWeight: 600 }}>{row.label}</span>
                </div>
                <label className="field">
                  <span>MDR (%)</span>
                  <input
                    type="number" min="0" max="50" step="0.01"
                    value={mdrForm.rates[row.key].percent}
                    disabled={!canManage}
                    onChange={(e) => onMdrRateChange(row.key, "percent", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>GST on MDR (%)</span>
                  <input
                    type="number" min="0" max="50" step="0.01"
                    value={mdrForm.rates[row.key].gstPercent}
                    disabled={!canManage}
                    onChange={(e) => onMdrRateChange(row.key, "gstPercent", e.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>

          {canManage && (
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={mdrSaving}>
                {mdrSaving ? "Saving…" : "Save MDR Settings"}
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
