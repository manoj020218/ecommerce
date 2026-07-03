const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const storePath = path.resolve(process.cwd(), env.staticPagesStorePath);

const DEFAULT_PAGES = [
  {
    id: "page_about_us",
    slug: "about-us",
    title: "About Us",
    metaTitle: "About Us | Jenix India",
    metaDescription: "Learn about Jenix India — India's trusted supplier of IoT security systems, CCTV, access control, and smart security products.",
    content: `<h2>About Jenix India</h2>
<p>Jenix India is one of India's leading suppliers of IoT-based security and surveillance systems. We serve businesses, institutions, and homeowners across the country with reliable, cost-effective security solutions.</p>
<p>Our product range includes IP CCTV cameras, face recognition access control systems, smart door locks, gate automation systems, video door phones, networking equipment, and GPS tracking devices.</p>
<h3>Our Mission</h3>
<p>To make advanced security technology accessible and affordable for every Indian home and business.</p>
<h3>Why Choose Jenix?</h3>
<ul>
<li><strong>100% Genuine Products</strong> — Authorised dealer for all major brands</li>
<li><strong>Pan India Shipping</strong> — Fast, tracked delivery across India</li>
<li><strong>GST Invoice</strong> — Proper tax invoices for all business purchases</li>
<li><strong>Expert Support</strong> — Technical guidance for installation and configuration</li>
<li><strong>Bulk Pricing</strong> — Special rates for dealers, installers, and institutions</li>
</ul>
<h3>Get in Touch</h3>
<p>Reach us on WhatsApp or call our support line for product advice, bulk quotations, or after-sales assistance.</p>`,
    isPublished: true,
    isDefault: true,
    showInFooter: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "page_contact_us",
    slug: "contact-us",
    title: "Contact Us",
    metaTitle: "Contact Us | Jenix India",
    metaDescription: "Get in touch with Jenix India for product enquiries, bulk orders, dealer programme, or after-sales support.",
    content: `<h2>Contact Us</h2>
<p>We're here to help. Reach out through any of the channels below and our team will respond within a few hours during business hours.</p>
<h3>General Enquiries</h3>
<p>Email: support@jenixindia.com<br>Phone: +91 63060 28330<br>WhatsApp: +91 63060 28330</p>
<h3>Business Hours</h3>
<p>Monday to Saturday: 10:00 AM – 7:00 PM IST<br>Sundays and Public Holidays: Closed</p>
<h3>Bulk / Dealer Enquiries</h3>
<p>For bulk orders, dealer programme, or project pricing, send us a WhatsApp message or fill out the enquiry form on our home page. Our sales team will get back to you within 4 working hours.</p>
<h3>GST Invoice</h3>
<p>All our invoices include a full GST breakup. Please provide your GSTIN at checkout for a proper tax invoice.</p>`,
    isPublished: true,
    isDefault: true,
    showInFooter: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "page_privacy_policy",
    slug: "privacy-policy",
    title: "Privacy Policy",
    metaTitle: "Privacy Policy | Jenix India",
    metaDescription: "Read how Jenix India collects, uses, and protects your personal information.",
    content: `<h2>Privacy Policy</h2>
<p>At Jenix India, we are committed to protecting your personal information. This Privacy Policy explains how we collect, use, and safeguard your data when you use our website.</p>
<h3>Information We Collect</h3>
<ul>
<li>Name, email address, phone number, and delivery address when you create an account or place an order</li>
<li>Payment details — processed securely via our payment gateways. We do not store card or UPI credentials</li>
<li>Device and browsing information for analytics and to improve your experience</li>
</ul>
<h3>How We Use Your Information</h3>
<ul>
<li>To process and fulfil your orders</li>
<li>To send order updates, delivery notifications, and support communications</li>
<li>To send promotional offers — you can opt out at any time</li>
<li>To improve our website and services</li>
</ul>
<h3>Sharing of Information</h3>
<p>We do not sell your personal information. We share data only with:</p>
<ul>
<li>Courier partners (name, address, phone — for delivery)</li>
<li>Payment processors (for secure transaction processing)</li>
<li>Government authorities if required by applicable law</li>
</ul>
<h3>Data Security</h3>
<p>We implement industry-standard security measures to protect your data. However, no transmission over the internet is 100% secure and we cannot guarantee absolute security.</p>
<h3>Cookies</h3>
<p>We use cookies to maintain your session, remember your cart, and improve browsing experience. You can disable cookies in your browser settings, though some features may not function correctly.</p>
<h3>Your Rights</h3>
<p>You may request access to, correction of, or deletion of your personal data by contacting us at support@jenixindia.com.</p>
<h3>Updates to This Policy</h3>
<p>We may update this policy from time to time. Continued use of our website constitutes acceptance of the updated policy.</p>`,
    isPublished: true,
    isDefault: true,
    showInFooter: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "page_terms_conditions",
    slug: "terms-and-conditions",
    title: "Terms and Conditions",
    metaTitle: "Terms and Conditions | Jenix India",
    metaDescription: "Terms and conditions governing the use of Jenix India website and purchase of products.",
    content: `<h2>Terms and Conditions</h2>
<p>By accessing or placing an order on Jenix India, you agree to the following terms and conditions. Please read them carefully before using our website.</p>
<h3>1. Products and Pricing</h3>
<p>All prices are in Indian Rupees (INR) and include applicable GST unless stated otherwise. We reserve the right to change prices at any time without prior notice. Product images are for illustration purposes and actual products may vary slightly.</p>
<h3>2. Order Acceptance</h3>
<p>Placing an order constitutes an offer to purchase. We reserve the right to accept or reject any order. An order is confirmed only after payment is received and verified by our team.</p>
<h3>3. Payment</h3>
<p>We accept payments via UPI, Net Banking, Credit/Debit Cards, and Bank Transfer. For bank transfer orders, dispatch happens after payment is confirmed, which may take 24–48 hours on business days.</p>
<h3>4. Warranty</h3>
<p>Products carry manufacturer warranty as specified on each product listing. Warranty claims must be made through the manufacturer's authorised service centres unless otherwise mentioned by us in writing.</p>
<h3>5. Intellectual Property</h3>
<p>All content on this website including text, images, logos, and product descriptions are the property of Jenix India or their respective owners and may not be reproduced without prior written permission.</p>
<h3>6. Limitation of Liability</h3>
<p>Jenix India shall not be liable for any indirect, incidental, or consequential damages arising from the use or inability to use our products or services beyond the value of the product purchased.</p>
<h3>7. Governing Law</h3>
<p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in India.</p>
<h3>8. Changes to Terms</h3>
<p>We reserve the right to update these terms at any time. Continued use of our website after changes constitutes acceptance of the updated terms.</p>`,
    isPublished: true,
    isDefault: true,
    showInFooter: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "page_refund_policy",
    slug: "refund-policy",
    title: "Refund Policy",
    metaTitle: "Refund & Return Policy | Jenix India",
    metaDescription: "Jenix India refund and return policy. Learn about return window, eligible items, and how to initiate a return.",
    content: `<h2>Refund & Return Policy</h2>
<p>We want you to be completely satisfied with your purchase. Please read our refund and return policy carefully before placing an order.</p>
<h3>Return Window</h3>
<p>Products can be returned within <strong>7 days</strong> of delivery, provided they are in their original, unused condition with all original packaging and accessories intact.</p>
<h3>Eligible for Return / Replacement</h3>
<ul>
<li>Wrong product delivered</li>
<li>Physically damaged product received — must be reported within <strong>48 hours</strong> of delivery with supporting photos/video</li>
<li>Dead on arrival (DOA) — product not functioning from first use</li>
<li>Missing accessories or parts as listed in product specifications</li>
</ul>
<h3>Not Eligible for Return</h3>
<ul>
<li>Products that have been installed, used, or tampered with</li>
<li>Products with serial number or warranty sticker removed or damaged</li>
<li>Damage caused by incorrect installation, wrong power supply, or misuse</li>
<li>Returns initiated after 7 days of delivery</li>
<li>Change of mind or wrong selection by the buyer</li>
</ul>
<h3>Refund Process</h3>
<p>Once we receive and inspect the returned product, refunds are processed within <strong>5–7 business days</strong> to your original payment method. For bank transfer payments, refunds are made to the source bank account.</p>
<h3>How to Initiate a Return</h3>
<p>Contact us via WhatsApp or email at support@jenixindia.com with your Order ID and photos/video of the issue. Our support team will guide you through the pickup and refund process.</p>`,
    isPublished: true,
    isDefault: true,
    showInFooter: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "page_shipping_policy",
    slug: "shipping-policy",
    title: "Shipping Policy",
    metaTitle: "Shipping Policy | Jenix India",
    metaDescription: "Jenix India shipping policy — delivery timelines, shipping charges, and order tracking information.",
    content: `<h2>Shipping Policy</h2>
<p>We ship to all locations across India through trusted courier partners. Orders are dispatched within 1–2 business days of confirmed payment.</p>
<h3>Delivery Timeline</h3>
<ul>
<li><strong>Metro cities</strong> (Mumbai, Delhi, Bengaluru, Chennai, Hyderabad, Pune, Kolkata): 2–4 business days</li>
<li><strong>Tier 2 / Tier 3 cities</strong>: 4–6 business days</li>
<li><strong>Remote / Rural areas</strong>: 6–10 business days</li>
</ul>
<h3>Shipping Charges</h3>
<p>Free shipping on all prepaid orders. For Cash on Delivery (COD) orders or orders below ₹999, a nominal shipping charge may apply and will be displayed at checkout before payment.</p>
<h3>Same Day Dispatch</h3>
<p>Orders placed before <strong>2:00 PM</strong> on business days (Monday–Saturday) are eligible for same-day dispatch, subject to stock availability.</p>
<h3>Order Tracking</h3>
<p>Once your order is dispatched, you will receive a tracking number via SMS and/or email. You can track your shipment on the respective courier's website.</p>
<h3>Damaged in Transit</h3>
<p>If your product arrives damaged due to transit, please photograph the damage immediately and contact us within <strong>48 hours</strong> of delivery via WhatsApp or email. We will arrange a replacement shipment at no extra cost.</p>
<h3>Address Accuracy</h3>
<p>Please ensure your delivery address, PIN code, and phone number are accurate at checkout. We are not responsible for delivery failures due to incorrect address information.</p>`,
    isPublished: true,
    isDefault: true,
    showInFooter: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

async function ensureStoreFile() {
  const dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch (_error) {
    await fs.writeFile(storePath, JSON.stringify({ pages: DEFAULT_PAGES }, null, 2), "utf-8");
  }
}

async function readStaticPagesStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(storePath, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.pages)) {
      parsed.pages = DEFAULT_PAGES;
      await fs.writeFile(storePath, JSON.stringify(parsed, null, 2), "utf-8");
    }
    return parsed;
  } catch (_error) {
    const fallback = { pages: DEFAULT_PAGES };
    await fs.writeFile(storePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeStaticPagesStore(store) {
  await ensureStoreFile();
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

module.exports = { readStaticPagesStore, writeStaticPagesStore, DEFAULT_PAGES };
