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
    setForm((current) => ({
      ...current,
      [name]: value
    }));
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
      setNotice("Thanks. Jenix will contact you about a similar webapp.");
    } catch (requestError) {
      setError(requestError.message || "Failed to submit your enquiry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-block buyer-lead-section">
      <div className="section-head">
        <h3>Do you want same type webapp for your business?</h3>
      </div>
      <p className="section-caption">
        Submit your business details and Jenix will contact you with a demo and rollout estimate.
      </p>

      <form className="buyer-lead-grid" onSubmit={onSubmit}>
        <label>
          <span>Name *</span>
          <input name="name" value={form.name} onChange={onChange} required />
        </label>
        <label>
          <span>Mobile *</span>
          <input name="mobile" value={form.mobile} onChange={onChange} required />
        </label>
        <label>
          <span>Email *</span>
          <input name="email" type="email" value={form.email} onChange={onChange} required />
        </label>
        <label>
          <span>Business Name *</span>
          <input name="businessName" value={form.businessName} onChange={onChange} required />
        </label>
        <label>
          <span>Business Type *</span>
          <input name="businessType" value={form.businessType} onChange={onChange} required />
        </label>
        <label>
          <span>City *</span>
          <input name="city" value={form.city} onChange={onChange} required />
        </label>
        <label>
          <span>Current Website</span>
          <input name="currentWebsite" value={form.currentWebsite} onChange={onChange} />
        </label>
        <label>
          <span>Monthly Orders</span>
          <input
            name="monthlyOrders"
            type="number"
            min="0"
            value={form.monthlyOrders}
            onChange={onChange}
          />
        </label>
        <label>
          <span>Product Count</span>
          <input
            name="productCount"
            type="number"
            min="0"
            value={form.productCount}
            onChange={onChange}
          />
        </label>
        <label className="field-full">
          <span>Message *</span>
          <textarea
            name="message"
            rows="4"
            value={form.message}
            onChange={onChange}
            required
          />
        </label>

        <div className="field-full buyer-lead-actions">
          <p className="section-caption">Source page: {`${location.pathname}${location.search}` || "/"}</p>
          <button type="submit" className="btn secondary" disabled={saving}>
            {saving ? "Submitting..." : "Request Demo"}
          </button>
        </div>
      </form>

      {notice ? <p className="buyer-lead-notice success">{notice}</p> : null}
      {error ? <p className="buyer-lead-notice error">{error}</p> : null}
    </section>
  );
}
