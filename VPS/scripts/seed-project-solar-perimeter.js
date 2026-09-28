#!/usr/bin/env node
// Adds the Projects page: Solar Plant Perimeter Intrusion Detection System
// (beam sensors + LoRaWAN + cloud + patrol app), 2026-09-28.
// Idempotent: skips if the slug exists. Images must already be in
// <UPLOAD_DIR>/projects/. Dry run by default; --apply to write. Editable
// afterwards in Admin → Projects.
// Usage (from VPS/): node scripts/seed-project-solar-perimeter.js [--apply]

require("dotenv").config({ path: require("node:path").resolve(process.cwd(), ".env") });
const fs = require("node:fs");
const path = require("node:path");
const { env } = require("../backend/src/config/env");
const { readProjectsStore, writeProjectsStore } = require("../backend/src/database/projects-store");
const { sanitizeProject } = require("../backend/src/modules/projects/projects.model");
const { generateId } = require("../backend/src/common/identity");

const apply = process.argv.includes("--apply");
const img = (file) => `${env.publicBaseUrl.replace(/\/$/, "")}/static/uploads/projects/${file}`;
const IMAGES = ["solar-perimeter-intrusion.webp", "solar-perimeter-architecture.webp"];

const project = {
  slug: "solar-plant-perimeter-intrusion-detection-system",
  title: "Solar Plant Perimeter Intrusion Detection System",
  tagline: "Know the moment anyone crosses your fence — which zone, what time — on the site office screen, at head office and on your patrol team's phones.",
  summary:
    "Beam sensors along the solar plant fence, divided into zones. Alarms travel over LoRaWAN to the site office, then through the cloud to head office, with live zone-wise alerts to the patrol team's app.",
  heroImageUrl: img("solar-perimeter-intrusion.webp"),

  problemTitle: "The problem: kilometres of fence, a few guards, and costly equipment",
  problemText:
    "Solar plants spread over hundreds of acres in remote areas. Panels, copper cables, inverter parts and batteries are regular targets for theft. A few guards cannot watch kilometres of fence, especially at night, and by the time a theft is noticed the thieves are gone. Running cables along the whole fence for sensors is expensive, there is no Wi-Fi in the field, and head office has no live view of what is happening at each plant.",
  solutionTitle: "The solution: zone-wise beam detection with LoRaWAN, cloud and a patrol app",
  solutionText:
    "Active infrared beam sensors are installed along the fence and grouped into zones. When a beam is broken, a battery- or solar-powered LoRaWAN node sends the alarm wirelessly — over long distances, with no cabling along the fence — to a LoRaWAN gateway at the site office, which sounds a siren and shows the zone on a local screen, even without internet. From the site office the data goes to the cloud, so head office sees every plant live, and the patrol team gets an instant zone-wise alert on their app to respond and acknowledge.",

  steps: [
    { title: "Beam sensors along the fence", text: "Active IR beam sensors cover the fence line, divided into zones (for example every 100–250 m) so you always know exactly where the intrusion is." },
    { title: "LoRaWAN node in each zone", text: "A low-power LoRaWAN node, running on battery or a small solar panel, sends the alarm wirelessly — no cable along the fence." },
    { title: "Site office gets it first", text: "A LoRaWAN gateway at the site office receives the alarm, sounds the siren and shows the zone on the local screen — even if the internet is down." },
    { title: "Cloud to head office", text: "The site office sends every event to the cloud over 4G or broadband, so head office sees all plants on one dashboard." },
    { title: "Patrol team alerted by zone", text: "Guards get an instant alert on the app with the zone and time, acknowledge it, and head there. SMS backup if the app is closed." },
    { title: "Reports and response times", text: "Every alarm, acknowledgement and action is logged. Reports show alarms per zone and how fast the team responded." }
  ],

  packages: [
    {
      name: "Site",
      tagline: "Zone-wise detection with a local alarm at the site office",
      bestFor: "Single plant, smaller rooftop / ground-mount sites",
      features: [
        "Active IR beam sensors along the fence, in zones",
        "LoRaWAN node per zone (battery / solar powered)",
        "LoRaWAN gateway at the site office",
        "Local screen showing zone status and alarms",
        "Siren / hooter at the site office",
        "Sensor tamper and node health alerts"
      ]
    },
    {
      name: "Connected",
      tagline: "Site + cloud + patrol team app",
      bestFor: "Utility-scale plants with a patrol team",
      features: [
        "Everything in Site",
        "Cloud dashboard for head office",
        "Patrol team app with zone-wise live alerts",
        "Acknowledge and respond from the app",
        "SMS backup alerts",
        "Alarm history and response-time reports"
      ]
    },
    {
      name: "Enterprise",
      tagline: "Many plants, one control room",
      bestFor: "IPPs, EPC / O&M companies, multi-plant portfolios",
      features: [
        "Everything in Connected",
        "All plants on one head office dashboard",
        "Zone map view for each plant",
        "Zone-wise floodlight / hooter trigger on alarm",
        "Integration with existing CCTV / NVR on request",
        "Role-based access for head office, site in-charge and guards",
        "On-site commissioning and guard training"
      ]
    }
  ],

  softwareFeatures: [
    "Zone-wise live status",
    "Instant alerts to the patrol app",
    "Acknowledge and response tracking",
    "Head office multi-plant dashboard",
    "Local site office screen that works offline",
    "Sensor tamper and node battery alerts",
    "Alarm history and reports",
    "SMS backup alerts",
    "Role-based user access"
  ],

  useCases: [
    "Utility-scale solar plants",
    "Solar parks",
    "Wind farms",
    "Substations and switchyards",
    "Warehouses and yards with long boundaries",
    "Factories and industrial plots",
    "Farmhouses and orchards",
    "Water treatment plants",
    "Remote telecom and infrastructure sites"
  ],

  whyUs: [
    "Designed end-to-end by Jenix — sensors, LoRaWAN, cloud and app",
    "No cabling along the fence — lower installation cost and faster setup",
    "Works at the site even when the internet is down",
    "Zone layout designed for your fence length and terrain",
    "Same platform can also monitor inverters, energy meters and DG sets",
    "Installation, commissioning and training for your guards",
    "GST invoice"
  ],

  gallery: [
    { url: img("solar-perimeter-intrusion.webp"), caption: "Fence divided into zones — a broken beam in Zone 4 shows up at the site office, head office and on the patrol app" },
    { url: img("solar-perimeter-architecture.webp"), caption: "How the alert travels: beam sensor → LoRaWAN → site office → cloud → head office and patrol team" }
  ],

  faqs: [
    { q: "Why LoRaWAN and not Wi-Fi or cables?", a: "A solar plant fence can be several kilometres long. LoRaWAN sends small alarm messages over long distances using very little power, so each zone node runs on a battery or small solar panel — no cabling along the fence and no Wi-Fi needed in the field." },
    { q: "What happens if the internet goes down?", a: "Detection and the site office alarm keep working, because the LoRaWAN gateway is at the site. Events are sent to the cloud and head office once the connection is back." },
    { q: "How long can a zone be?", a: "It depends on the beam sensor range and the fence layout. Shorter zones tell guards more precisely where to go. We design the zone plan after a site survey." },
    { q: "What about false alarms from animals or dust?", a: "Beam sensors with multiple beams and the right mounting height reduce false alarms from small animals, birds and dust. Zone layout and sensor choice are planned for your site." },
    { q: "Can it work with our existing CCTV?", a: "On request, an alarm in a zone can be linked to the camera covering that zone, so the operator can check it immediately." },
    { q: "How is the price decided?", a: "It depends on the fence length, number of zones, number of plants and the package. Share your details and we will send a quotation after a site survey." }
  ],

  enquiryQuestions: [
    "Plant capacity (MW) and area (acres)",
    "Total fence / boundary length (km)",
    "Number of plants / sites",
    "Do you have a patrol / security team on site?"
  ],

  seoTitle: "Solar Plant Perimeter Intrusion Detection | Beam Sensor + LoRaWAN Fence Security — Jenix",
  seoDescription:
    "Zone-wise perimeter intrusion detection for solar plants: beam sensors, LoRaWAN to the site office, cloud dashboard for head office and live alerts to the patrol team app. Get a quote.",
  isPublished: true,
  sortOrder: 5
};

(async () => {
  const uploadsDir = path.resolve(process.cwd(), env.uploadDir, "projects");
  const missing = IMAGES.filter((f) => !fs.existsSync(path.join(uploadsDir, f)));
  console.log("missing images:", missing.length ? missing : "none");
  const store = await readProjectsStore();
  if (store.projects.some((p) => p.slug === project.slug)) { console.log("project already exists — nothing to do"); return; }
  if (!apply) { console.log("dry run - would create:", project.title); return; }
  if (missing.length) { console.error("images missing — not creating"); process.exit(1); }
  const now = new Date().toISOString();
  store.projects.push(sanitizeProject({ ...project, id: generateId("project"), createdAt: now, updatedAt: now }));
  await writeProjectsStore(store);
  console.log("created:", project.slug);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
