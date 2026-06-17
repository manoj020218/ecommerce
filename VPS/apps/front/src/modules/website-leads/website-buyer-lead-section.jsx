import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontInput,
  StorefrontSectionHeader,
  StorefrontTextArea
} from "../../shared/storefront/storefront-ui";
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
    <section className="proto-section">
      <StorefrontSectionHeader title="Do you want same type webapp for your business?" />
      <p className="section-caption">
        Submit your business details and Jenix will contact you with a demo and rollout estimate.
      </p>

      <form className="proto-form-grid" onSubmit={onSubmit}>
        <StorefrontInput label="Name *" name="name" value={form.name} onChange={onChange} required />
        <StorefrontInput label="Mobile *" name="mobile" value={form.mobile} onChange={onChange} required />
        <StorefrontInput label="Email *" name="email" type="email" value={form.email} onChange={onChange} required />
        <StorefrontInput
          label="Business Name *"
          name="businessName"
          value={form.businessName}
          onChange={onChange}
          required
        />
        <StorefrontInput
          label="Business Type *"
          name="businessType"
          value={form.businessType}
          onChange={onChange}
          required
        />
        <StorefrontInput label="City *" name="city" value={form.city} onChange={onChange} required />
        <StorefrontInput
          label="Current Website"
          name="currentWebsite"
          value={form.currentWebsite}
          onChange={onChange}
        />
        <StorefrontInput
          label="Monthly Orders"
          name="monthlyOrders"
          type="number"
          min="0"
          value={form.monthlyOrders}
          onChange={onChange}
        />
        <StorefrontInput
          label="Product Count"
          name="productCount"
          type="number"
          min="0"
          value={form.productCount}
          onChange={onChange}
        />
        <StorefrontTextArea
          label="Message *"
          fieldClassName="wide"
          name="message"
          rows="4"
          value={form.message}
          onChange={onChange}
          required
        />

        <div className="wide proto-inline-actions">
          <p className="section-caption">Source page: {`${location.pathname}${location.search}` || "/"}</p>
          <StorefrontButton type="submit" disabled={saving}>
            {saving ? "Submitting..." : "Request Demo"}
          </StorefrontButton>
        </div>
      </form>

      {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}
      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}
    </section>
  );
}
