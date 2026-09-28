#!/usr/bin/env node
// Adds the Projects page: Smart Farm Pump Control System (2026-09-28).
// Idempotent: skips if the slug exists. Images must already be in
// <UPLOAD_DIR>/projects/. Dry run by default; --apply to write. Editable
// afterwards in Admin → Projects.
// Usage (from VPS/): node scripts/seed-project-farm-pump.js [--apply]

require("dotenv").config({ path: require("node:path").resolve(process.cwd(), ".env") });
const fs = require("node:fs");
const path = require("node:path");
const { env } = require("../backend/src/config/env");
const { readProjectsStore, writeProjectsStore } = require("../backend/src/database/projects-store");
const { sanitizeProject } = require("../backend/src/modules/projects/projects.model");
const { generateId } = require("../backend/src/common/identity");

const apply = process.argv.includes("--apply");
const img = (file) => `${env.publicBaseUrl.replace(/\/$/, "")}/static/uploads/projects/${file}`;
const IMAGES = ["farm-pump-control.webp", "farm-pump-alerts.webp"];

const project = {
  slug: "smart-farm-pump-control-system",
  title: "Smart Farm Pump Control System",
  tagline: "Switch your borewell or irrigation pump ON / OFF from your phone — no more trips to the farm at night.",
  summary:
    "Control and monitor farm pumps from anywhere over 4G. Timers, automatic tank-full cut-off, and alerts for power cuts, dry run and phase failure — designed and installed by Jenix for your farm.",
  heroImageUrl: img("farm-pump-control.webp"),

  problemTitle: "The problem: the pump is far away, and power comes at odd hours",
  problemText:
    "Farm power often comes at night or at changing times. Farmers travel to the field just to switch the pump on, wait for power, and go back again to switch it off. If power fails and returns, nobody knows whether the pump restarted. A pump running without water (dry run) or on a missing phase can burn the motor, and an overflowing tank wastes water and electricity.",
  solutionTitle: "The solution: control the pump from your phone",
  solutionText:
    "A Jenix controller with its own 4G SIM is installed next to your existing pump starter. From the mobile app you can switch the pump on or off, set timers, and see whether power is available and the pump is running. It sends app and SMS alerts on power cuts, power return, dry run and phase failure, and can switch the pump off automatically when the tank is full or the water runs out. Add soil-moisture sensors and valves to irrigate each zone automatically.",

  steps: [
    { title: "Controller next to your starter", text: "The controller is wired to your existing pump starter — no need to replace the pump or starter." },
    { title: "Connected over 4G", text: "The controller has its own SIM, so it works in the field even without Wi-Fi or internet at the farm." },
    { title: "ON / OFF from the app", text: "Start or stop the pump from your phone, from anywhere, and see at once whether it is running." },
    { title: "Timers and automatic control", text: "Set daily timers, run for a fixed time, or switch off automatically when the tank is full." },
    { title: "Protection for the motor", text: "Dry run, phase failure and low voltage are detected and the pump is switched off to protect the motor." },
    { title: "Alerts and history", text: "App and SMS alerts for power cut, power return and faults, with a daily record of pump running hours." }
  ],

  packages: [
    {
      name: "Basic",
      tagline: "Pump ON / OFF from your phone",
      bestFor: "Single borewell or open-well pump",
      features: [
        "4G controller with SIM, fitted next to your starter",
        "Pump ON / OFF from the mobile app",
        "Power available / pump running status",
        "SMS + app alert on power cut and power return",
        "Works with single-phase and 3-phase pumps"
      ]
    },
    {
      name: "Advanced",
      tagline: "Automatic control with motor protection",
      bestFor: "Farms with an overhead tank or pond, high-value motors",
      features: [
        "Everything in Basic",
        "Daily timers and run-for-fixed-time",
        "Tank / pond level sensor — auto OFF when full",
        "Dry run protection",
        "Phase failure and low-voltage protection",
        "Daily running hours and history"
      ]
    },
    {
      name: "More Advanced",
      tagline: "Smart irrigation for the whole farm",
      bestFor: "Orchards, polyhouses, large and multi-plot farms",
      features: [
        "Everything in Advanced",
        "Multiple pumps and borewells in one app",
        "Soil moisture sensors in the field",
        "Solenoid valves for zone-wise irrigation",
        "Irrigation schedules by zone",
        "Electricity use per pump (energy meter)",
        "Family members / farm workers with their own login"
      ]
    }
  ],

  softwareFeatures: [
    "Pump ON / OFF from anywhere",
    "Timers and schedules",
    "Power and pump status",
    "SMS + app alerts",
    "Tank level with auto cut-off",
    "Running hours and history",
    "Multiple pumps and farms in one app",
    "Access for family members and workers"
  ],

  useCases: [
    "Borewell pumps",
    "Open-well and canal pumps",
    "Drip and sprinkler irrigation",
    "Farmhouses",
    "Orchards and plantations",
    "Polyhouses and greenhouses",
    "Dairy and poultry farms",
    "Overhead tank filling",
    "Community / shared pumps"
  ],

  whyUs: [
    "Built on the same Jenix IoT platform that monitors fire-fighting systems in commercial buildings",
    "Works with your existing pump and starter",
    "Own 4G SIM — no internet or Wi-Fi needed at the farm",
    "Start with Basic and add sensors and valves later",
    "Installation and training for you and your family",
    "GST invoice"
  ],

  gallery: [
    { url: img("farm-pump-control.webp"), caption: "Controller next to the starter, pump controlled from the phone over 4G" },
    { url: img("farm-pump-alerts.webp"), caption: "Alerts for power cut, power return, dry run, phase failure and tank full" }
  ],

  faqs: [
    { q: "Does it need internet or Wi-Fi at the farm?", a: "No. The controller has its own SIM and works on the mobile network. You just need mobile signal at the pump house." },
    { q: "Will it work with my existing pump and starter?", a: "Yes. The controller is connected to your existing starter. It works with single-phase and 3-phase pumps." },
    { q: "What happens when power goes and comes back?", a: "You get an alert when power goes and when it returns. You can choose whether the pump should restart automatically or wait for you to switch it on." },
    { q: "Can it protect my motor?", a: "The Advanced package detects dry run, phase failure and low voltage and switches the pump off, with an alert on your phone." },
    { q: "Can more than one person control the pump?", a: "Yes. Family members or farm workers can have their own login, and every ON / OFF is recorded with who did it." },
    { q: "How is the price decided?", a: "It depends on the number of pumps, pump type, the package and any sensors or valves you need. Share your details and we will send a quotation for your farm." }
  ],

  enquiryQuestions: [
    "Number of pumps / borewells",
    "Pump HP and type (single-phase / 3-phase)",
    "Mobile network at the pump house (Jio / Airtel / Vi / BSNL)",
    "Village / district"
  ],

  seoTitle: "Smart Farm Pump Controller | Mobile Pump ON/OFF, Borewell & Irrigation Automation — Jenix",
  seoDescription:
    "Switch your farm or borewell pump ON/OFF from your phone over 4G. Timers, tank-full auto cut-off, dry run and phase failure protection, SMS alerts. Get a quote from Jenix India.",
  isPublished: true,
  sortOrder: 4
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
