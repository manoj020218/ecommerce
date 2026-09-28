#!/usr/bin/env node
// Creates the first Projects page: Smart Parking Space Calculation for
// Basement Parking (2026-09-28). Idempotent: skips if the slug exists.
// Images must already be in <UPLOAD_DIR>/projects/ (see IMAGES below).
// Dry run by default; --apply to write. Everything is editable afterwards
// in Admin → Projects.   Usage (from VPS/): node scripts/seed-project-smart-parking.js [--apply]

require("dotenv").config({ path: require("node:path").resolve(process.cwd(), ".env") });
const fs = require("node:fs");
const path = require("node:path");
const { env } = require("../backend/src/config/env");
const { readProjectsStore, writeProjectsStore } = require("../backend/src/database/projects-store");
const { sanitizeProject } = require("../backend/src/modules/projects/projects.model");
const { generateId } = require("../backend/src/common/identity");

const apply = process.argv.includes("--apply");
const img = (file) => `${env.publicBaseUrl.replace(/\/$/, "")}/static/uploads/projects/${file}`;
const IMAGES = [
  "smart-parking-entry-display.webp",
  "smart-parking-how-it-works.webp",
  "smart-parking-basic-package.webp",
  "smart-parking-advanced-packages.webp"
];

const project = {
  slug: "smart-parking-space-calculation-basement-parking",
  title: "Smart Parking Space Calculation Project for Basement Parking",
  tagline: "Show drivers at the entry whether a space is free — before they drive into the basement.",
  summary:
    "A live parking-availability display at your basement entry, with optional automatic boom barriers and per-slot guidance. Designed, built and customised by Jenix for your site.",
  heroImageUrl: img("smart-parking-entry-display.webp"),

  problemTitle: "The problem: drivers find out the basement is full only after they go down",
  problemText:
    "In most basement parkings there is no way to know, at the entry, whether a space is actually free. Drivers go down, circle one level after another for 30–45 minutes, block ramps and come out frustrated. Visitors blame the building, tenants complain, and security staff spend their day managing traffic instead of security.",
  solutionTitle: "The solution: a live parking count at the entry",
  solutionText:
    "Vehicle sensors at the entry and exit count every car in and out. A controller keeps the live count (Available = Total capacity − Occupied) and shows it on a bright LED display at the entry: \"PARKING AVAILABLE 42\" or \"FULL\". Drivers decide before they enter. Add automatic boom barriers, or a sensor on every slot with a mobile app that guides the driver to the exact free space — the system grows with your needs.",

  steps: [
    { title: "Vehicle detected at entry / exit", text: "Loop detectors at the entry and exit lanes detect every vehicle that comes in or goes out." },
    { title: "Controller keeps the live count", text: "The parking controller calculates available spaces from total capacity in real time — per level if you have B1, B2…" },
    { title: "Display at the entry", text: "A 1×2 ft LED display shows \"PARKING AVAILABLE\" with the count, or \"FULL\", before the driver enters." },
    { title: "Barrier opens only when there is space", text: "Advanced package: the entry boom barrier opens automatically only when a space is free." },
    { title: "Guidance to the exact free slot", text: "More Advanced package: a sensor and indicator light on every slot, plus a mobile app that guides the driver to a free space." },
    { title: "Monitor from anywhere", text: "Live count, entry/exit logs, display status and reports on the web and mobile dashboard." }
  ],

  packages: [
    {
      name: "Basic",
      tagline: "Entry / exit counting with a display at the entry",
      bestFor: "Residential societies, small offices, hotels",
      features: [
        "2 loop detectors (entry & exit)",
        "Parking controller (microcontroller based)",
        "1×2 ft LED display at the entry — available count / FULL",
        "Live count and entry/exit logs on web & mobile dashboard",
        "Configured for your total capacity and levels"
      ]
    },
    {
      name: "Advanced",
      tagline: "Everything in Basic + automatic boom barriers",
      bestFor: "Commercial buildings, hospitals, IT parks",
      features: [
        "Everything in Basic",
        "Entry boom barrier — opens only when a space is available",
        "Exit boom barrier",
        "Barrier logic linked to live availability",
        "Manual override for security staff"
      ]
    },
    {
      name: "More Advanced",
      tagline: "Individual slot tracking with driver guidance",
      bestFor: "Malls, multiplexes, large complexes",
      features: [
        "Everything in Advanced",
        "Ultrasonic sensor on every parking slot",
        "Green / red indicator light above each slot",
        "Live slot map on the dashboard",
        "Mobile app guides the driver to a free slot",
        "Occupancy reports and analytics"
      ]
    }
  ],

  softwareFeatures: [
    "Remote monitoring on web and mobile",
    "Live available / occupied count",
    "Entry and exit logs with reports",
    "Display board status",
    "Multi-level support (B1, B2 …)",
    "Occupancy trends and analytics"
  ],

  useCases: [
    "Commercial & office towers",
    "Shopping malls",
    "Hospitals",
    "Hotels & banquet halls",
    "Residential societies & apartments",
    "IT parks",
    "Multiplexes",
    "Educational institutes",
    "Government offices"
  ],

  whyUs: [
    "Hardware and software designed in-house by Jenix — not a boxed product, a solution built for your site",
    "Customised to your levels, gates and capacity",
    "We supply the key components ourselves — sensors, controllers, LED displays and boom barriers",
    "Start with Basic and upgrade to Advanced or More Advanced later",
    "Installation and commissioning support, with training for your staff",
    "GST invoice"
  ],

  gallery: [
    { url: img("smart-parking-entry-display.webp"), caption: "Display at the basement entry — available and full states" },
    { url: img("smart-parking-how-it-works.webp"), caption: "How the system works, from detection to dashboard" },
    { url: img("smart-parking-basic-package.webp"), caption: "Basic package — entry/exit counting with display" },
    { url: img("smart-parking-advanced-packages.webp"), caption: "Advanced and More Advanced packages" }
  ],

  faqs: [
    { q: "Does it work in a basement without internet?", a: "Yes. Counting, the entry display and barrier control run locally on the controller. Internet is only needed for the remote dashboard and mobile app." },
    { q: "Can we start with Basic and upgrade later?", a: "Yes. The system is designed to grow — barriers and per-slot sensors can be added to an existing Basic installation." },
    { q: "Does it work with multiple basement levels (B1, B2…)?", a: "Yes. Each level can have its own count, and the entry display can show the total or level-wise availability." },
    { q: "Can the count be corrected if needed?", a: "Yes. Authorised staff can correct the count, for example after vehicles leave through an unmonitored gate." },
    { q: "Do you supply the hardware?", a: "Yes — sensors, controllers, LED displays and boom barriers are supplied by Jenix as part of the project." },
    { q: "How is the price decided?", a: "It depends on the number of parking spaces, levels and gates, the package you choose and your site conditions. Share your details and we will send a quotation specific to your requirement." }
  ],

  enquiryQuestions: [
    "Number of parking spaces",
    "Number of basement levels",
    "Number of entry / exit gates",
    "Type of property (mall, office, society…)"
  ],

  seoTitle: "Smart Basement Parking Availability System | Parking Space Counter & Guidance — Jenix India",
  seoDescription:
    "Show parking availability at your basement entry. Live space counter with LED display, automatic boom barriers and per-slot guidance. Custom IoT project by Jenix India — get a quote.",
  isPublished: true,
  sortOrder: 1
};

(async () => {
  const uploadsDir = path.resolve(process.cwd(), env.uploadDir, "projects");
  const missing = IMAGES.filter((f) => !fs.existsSync(path.join(uploadsDir, f)));
  console.log("uploads dir:", uploadsDir, "| missing images:", missing.length ? missing : "none");
  console.log("image URL example:", img(IMAGES[0]));

  const store = await readProjectsStore();
  if (store.projects.some((p) => p.slug === project.slug)) {
    console.log("project already exists — nothing to do");
    return;
  }
  if (!apply) {
    console.log("dry run - would create:", project.title, "| packages:", project.packages.map((p) => p.name).join(", "));
    return;
  }
  if (missing.length) { console.error("images missing — not creating"); process.exit(1); }
  const now = new Date().toISOString();
  store.projects.push(sanitizeProject({ ...project, id: generateId("project"), createdAt: now, updatedAt: now }));
  await writeProjectsStore(store);
  console.log("created:", project.slug);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
