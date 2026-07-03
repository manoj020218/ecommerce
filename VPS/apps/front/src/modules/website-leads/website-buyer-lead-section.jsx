import { useState } from "react";
import { useLocation } from "react-router-dom";
import { createWebsiteLead } from "./website-leads.api";

const EMPTY_FORM = {
  name: "",
  mobile: "",
  email: "",
  businessName: "",
  businessType: "",
  city: "",
  currentWebsite: "",
  monthlyOrders: "",
  productCount: "",
  message: ""
};

export function WebsiteBuyerLeadSection() {
  const location = useLocation();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await createWebsiteLead({
        ...form,
        monthlyOrders: form.monthlyOrders.trim() ? Number(form.monthlyOrders) : null,
        productCount: form.productCount.trim() ? Number(form.productCount) : null,
        sourcePage: `${location.pathname}${location.search}` || "/"
      });
      setForm(EMPTY_FORM);
      setNotice("Thanks! Jenix will contact you about a custom platform for your business.");
    } catch (requestError) {
      setError(requestError.message || "Failed to submit your enquiry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="proto-biz-lead">
      <div className="proto-biz-lead-inner">
        <p className="proto-biz-eyebrow">For Businesses</p>
        <h2 className="proto-biz-title">Want This Platform for Your Business?</h2>
        <p className="proto-biz-desc">
          We build custom IoT &amp; security e-commerce platforms. Get a free demo.
        </p>

        <div className="proto-biz-form-card">
          <form onSubmit={onSubmit}>
            <div className="proto-biz-form-grid">
              <input
                className="proto-biz-input"
                name="name"
                placeholder="Your Name"
                value={form.name}
                onChange={onChange}
                required
                autoComplete="name"
              />
              <input
                className="proto-biz-input"
                name="mobile"
                placeholder="Mobile Number"
                type="tel"
                value={form.mobile}
                onChange={onChange}
                required
                autoComplete="tel"
              />
              <input
                className="proto-biz-input"
                name="businessName"
                placeholder="Business Name"
                value={form.businessName}
                onChange={onChange}
                required
              />
              <input
                className="proto-biz-input"
                name="city"
                placeholder="City"
                value={form.city}
                onChange={onChange}
                required
              />
            </div>
            {/* email, businessType, currentWebsite, monthlyOrders, productCount, message kept in state for API */}
            <button
              type="submit"
              className="proto-biz-submit"
              disabled={saving}
            >
              {saving ? "Submitting…" : "Request Free Demo →"}
            </button>
          </form>

          {notice ? (
            <p className="proto-biz-success">{notice}</p>
          ) : null}
          {error ? (
            <p className="proto-biz-error">{error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
