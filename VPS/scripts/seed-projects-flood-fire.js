#!/usr/bin/env node
// Adds two Projects pages (2026-09-28): FloodGuard (underpass water logging
// alarm) and FireGuard (fire alarm & fire-fighting system monitoring).
// Idempotent: skips any slug that already exists. Images must already be in
// <UPLOAD_DIR>/projects/. Dry run by default; --apply to write. Everything is
// editable afterwards in Admin → Projects.
// Usage (from VPS/): node scripts/seed-projects-flood-fire.js [--apply]

require("dotenv").config({ path: require("node:path").resolve(process.cwd(), ".env") });
const fs = require("node:fs");
const path = require("node:path");
const { env } = require("../backend/src/config/env");
const { readProjectsStore, writeProjectsStore } = require("../backend/src/database/projects-store");
const { sanitizeProject } = require("../backend/src/modules/projects/projects.model");
const { generateId } = require("../backend/src/common/identity");

const apply = process.argv.includes("--apply");
const img = (file) => `${env.publicBaseUrl.replace(/\/$/, "")}/static/uploads/projects/${file}`;

const floodguard = {
  slug: "underpass-water-logging-alarm-system-floodguard",
  title: "Underpass Water Logging Alarm System (FloodGuard)",
  tagline: "Warn drivers before they enter a flooded underpass — loud siren on site, instant alert on your phone.",
  summary:
    "IoT water level alarm for railway under bridges (RUBs), city underpasses and low-lying roads. Siren and mobile alerts within seconds, works offline, one dashboard for every site.",
  heroImageUrl: img("floodguard-underpass-alarm.webp"),
  externalUrl: "https://floodguard.jenix.in/",
  externalLabel: "Visit the FloodGuard website — proposals & live dashboard",

  problemTitle: "The problem: every monsoon, vehicles drive into flooded underpasses",
  problemText:
    "Railway under bridges and city underpasses fill with water within minutes of heavy rain. Two-wheelers, autos and cars enter without knowing how deep it is — even 30 cm of moving water can sweep a vehicle away. Most underpasses have no water level sensor, no alarm and no warning sign that switches on by itself. Manual patrolling is patchy, especially at night, and the responsible department often learns about it only after an accident — with no record to show that action was taken in time.",
  solutionTitle: "The solution: automatic water level alarm at every underpass",
  solutionText:
    "A non-contact ultrasonic sensor mounted at the top of the underpass measures the water depth every few seconds. When the water crosses the Alert or Danger level you set, the controller switches on a loud siren and flashing light at the site — even without internet — and sends instant alerts to operators on the FloodGuard app. Every event is logged with time, so you have a complete record for audits and compliance. One dashboard shows all your sites.",

  steps: [
    { title: "Sensor measures the water", text: "Ultrasonic + RS485 level sensors at the top of the underpass measure water depth every few seconds, to the millimetre." },
    { title: "Controller checks the levels", text: "The controller compares the depth with your Alert / Danger / Clear levels. It works on site even without internet." },
    { title: "Siren warns drivers", text: "A loud siren and flashing light switch on at the underpass the moment water logging becomes dangerous." },
    { title: "Operators alerted instantly", text: "Live data goes to the cloud; operators get an alert on the app within seconds and can see the live level." },
    { title: "Control from anywhere", text: "Mute the alarm, clear an incident or run a test remotely from the app — no site visit needed." },
    { title: "Complete audit trail", text: "Every reading, alarm and action is time-stamped and can be exported as a report." }
  ],

  packages: [
    {
      name: "Standalone",
      tagline: "One controller per underpass with Wi-Fi",
      bestFor: "Single underpass, pilot projects, private campuses",
      features: [
        "Ultrasonic water level sensor (non-contact)",
        "Controller in a weatherproof enclosure",
        "Siren and flashing light at the site",
        "Alert / Danger levels set for your site",
        "Mobile app + web dashboard with live level",
        "12 V DC power, solar-ready"
      ]
    },
    {
      name: "Redundant (MCU + RTU)",
      tagline: "Two sensors, alarms at both approaches, 4G + Wi-Fi",
      bestFor: "Railway under bridges, busy city underpasses",
      features: [
        "Everything in Standalone",
        "Second RS485 level sensor to cross-check readings",
        "Remote alarm units (RTU) at both approaches — siren, flash light and voice",
        "Cellular (SIM) + Wi-Fi connectivity",
        "Battery / solar backup for power cuts",
        "Health monitoring of every unit"
      ]
    },
    {
      name: "City-wide / Division rollout",
      tagline: "Many sites, one control room",
      bestFor: "Railway divisions, municipal corporations, smart cities",
      features: [
        "Everything in Redundant",
        "Unlimited sites on one dashboard",
        "Role-based access — admin, department, operator, viewer",
        "REST API and MQTT feed for ICCC / SCADA integration",
        "Over-the-air firmware updates for all devices",
        "Audit reports and CSV export for compliance"
      ]
    }
  ],

  softwareFeatures: [
    "Live water level with Alert / Danger / Clear status",
    "Instant alerts on the app",
    "Remote mute, clear and test",
    "Multi-site dashboard",
    "Audit reports and CSV export",
    "Offline-safe — the alarm works without internet",
    "Over-the-air firmware updates",
    "Role-based user access",
    "Works as an app on Android, iPhone and desktop"
  ],

  useCases: [
    "Railway under bridges (RUB)",
    "City underpasses",
    "Highway underpasses (NHAI / state highways)",
    "Low-lying roads and dips",
    "Smart city command centres",
    "Development authorities",
    "Hospital and campus basement ramps",
    "Industrial parks",
    "Underground parking entries"
  ],

  whyUs: [
    "Our own product — hardware, firmware, app and cloud designed and built by Jenix",
    "Already running at a live site, with real data on the dashboard",
    "Ready technical proposals and budget-justification reports for authorities",
    "Site survey, detailed BOM and tender documentation support",
    "Installation at a new site usually takes 2–4 hours, with no civil work in most cases",
    "GST invoice"
  ],

  gallery: [
    { url: img("floodguard-underpass-alarm.webp"), caption: "Sensor, siren and warning at the underpass, alert on the phone" },
    { url: img("floodguard-app-live-site.webp"), caption: "FloodGuard app — live reading from an installed site" },
    { url: img("floodguard-dashboard-concept.webp"), caption: "Dashboard: water level, device health and alarm controls" }
  ],

  faqs: [
    { q: "Does the alarm work without internet or during a power cut?", a: "Yes. The siren is triggered by the controller at the site, so it works without internet. With battery or solar backup it keeps working during power cuts, and data syncs to the cloud when the connection returns." },
    { q: "How fast is the alarm?", a: "The siren switches on within seconds of the water crossing the level you set. App alerts arrive within about 2–5 seconds when the site is online. A short delay can be set to avoid false alarms from splashes." },
    { q: "Can one dashboard show many underpasses?", a: "Yes, there is no limit on the number of sites. Each site has its own levels and operators." },
    { q: "Can it connect to our ICCC or SCADA?", a: "Yes. FloodGuard provides a REST API and live MQTT data for integration." },
    { q: "How long does installation take?", a: "Usually 2–4 hours per site: mount the sensor, install the controller, connect power and register it on the dashboard. Civil work is normally not needed." },
    { q: "Do you help with proposals and tenders?", a: "Yes. We provide technical proposals, justification reports for budget approval, site-specific BOMs and tender documentation." },
    { q: "How is the price decided?", a: "It depends on the number of sites, the package, connectivity and power backup needed. Share your details and we will send a quotation for your project." }
  ],

  enquiryQuestions: [
    "Number of underpasses / sites",
    "Organisation type (Railways, municipal, NHAI, private…)",
    "Location(s) of the sites",
    "Power available at site? (mains / solar / none)"
  ],

  seoTitle: "Underpass Water Logging Alarm System | RUB Flood Monitoring — FloodGuard by Jenix",
  seoDescription:
    "IoT water logging alarm for railway under bridges and underpasses. Siren on site, instant mobile alerts, works offline, multi-site dashboard. Get a quote from Jenix India.",
  isPublished: true,
  sortOrder: 2
};

const fireguard = {
  slug: "fire-alarm-fire-fighting-system-monitoring-fireguard",
  title: "Fire Alarm & Fire-Fighting System Monitoring (FireGuard)",
  tagline: "Know your fire pumps, pressure lines, water tank and fire alarm panel are working — before you need them.",
  summary:
    "A gateway in your pump room connects to your existing fire-fighting equipment and alerts your team by app and SMS the moment anything fails — 24×7, for one building or many.",
  heroImageUrl: img("fireguard-pump-room-monitoring.webp"),
  externalUrl: "https://fireguard.iotsoft.in/",
  externalLabel: "Visit the FireGuard website",

  problemTitle: "The problem: fire systems fail silently",
  problemText:
    "Fire-fighting systems are usually checked by hand, once in a while. A tripped jockey pump, a diesel pump that won't start, falling hydrant pressure, a low water tank or a dead battery can go unnoticed for weeks — until the day of a fire. By then it is too late, and after an inspection or an incident there is no record showing the system was being looked after.",
  solutionTitle: "The solution: 24×7 monitoring with instant alerts",
  solutionText:
    "The FireGuard gateway connects to the equipment you already have — pumps, pressure transmitters, tank level, diesel fuel, battery and the fire alarm panel — over RS485 / Modbus and dry contacts. Your team sees the live status on the dashboard and mobile app, and gets an alert by app and SMS the instant anything changes. The gateway has its own 4G link, so SMS alerts go out even if the building's internet is down.",

  steps: [
    { title: "Gateway installed in the pump room", text: "The FireGuard gateway is mounted in the pump room and wired to your existing equipment over RS485 / Modbus." },
    { title: "Equipment mapped", text: "Pumps, pressure lines, tanks, fuel, battery and the fire alarm panel are set up as monitored points." },
    { title: "Live status every few seconds", text: "The dashboard and mobile app show every pump, pressure and level in real time." },
    { title: "Instant app + SMS alerts", text: "A fault, a pressure drop or a fire alarm signal reaches your team by app and SMS within seconds." },
    { title: "No data lost", text: "If the internet drops, the gateway stores readings and fills the gaps when it reconnects. 4G, Ethernet and Wi-Fi fail over automatically." },
    { title: "Reports for audits", text: "Alarm history and reports keep your fire system inspection-ready." }
  ],

  packages: [
    {
      name: "Pump Room",
      tagline: "Monitor the heart of your fire system",
      bestFor: "Single building, hotels, residential societies",
      features: [
        "FireGuard gateway (RS485 / Modbus)",
        "Jockey, main and diesel pump status",
        "Header pressure",
        "Fire water tank level",
        "Live dashboard + mobile app",
        "App push alerts"
      ]
    },
    {
      name: "Complete Fire System",
      tagline: "Pumps + fire alarm panel + everything around them",
      bestFor: "Commercial buildings, hospitals, malls, factories",
      features: [
        "Everything in Pump Room",
        "Fire alarm panel signals — fire, fault and supervisory",
        "Sprinkler and hydrant pressure by zone",
        "Diesel fuel level and DG battery voltage",
        "SMS alerts to multiple numbers over 4G",
        "4G + Ethernet + Wi-Fi failover",
        "History and reports for audits"
      ]
    },
    {
      name: "Multi-site",
      tagline: "All your buildings on one screen",
      bestFor: "Campuses, hospital chains, facility management companies",
      features: [
        "Everything in Complete Fire System",
        "Many buildings under one login",
        "Roles for owners, facility managers, maintenance staff and viewers",
        "Daily health insights — e.g. a battery slowly draining",
        "API and integrations",
        "On-site onboarding and dedicated support"
      ]
    }
  ],

  softwareFeatures: [
    "Live status of every pump, pressure and level",
    "Instant app and SMS alerts",
    "Alarm history and reports",
    "Daily health insights",
    "Multi-site with role-based access",
    "Offline buffering — no data lost",
    "Secure over-the-air updates",
    "Web dashboard + Android app"
  ],

  useCases: [
    "Commercial & office buildings",
    "Hospitals",
    "Hotels",
    "Shopping malls",
    "Factories & warehouses",
    "Residential high-rises",
    "Schools & campuses",
    "Data centres",
    "Facility management companies"
  ],

  whyUs: [
    "Our own product — gateway, cloud dashboard and app built by Jenix / IOT Soft",
    "Works with the fire equipment you already have — no need to replace it",
    "SMS alerts over the gateway's own 4G, even when the building internet is down",
    "Can be extended to energy meters, DG sets, water tanks and other equipment on the same gateway",
    "Installation, configuration and staff training",
    "GST invoice"
  ],

  gallery: [
    { url: img("fireguard-pump-room-monitoring.webp"), caption: "Pumps, pressure, tank and fire alarm panel connected to the FireGuard gateway" },
    { url: img("fireguard-dashboard.webp"), caption: "FireGuard dashboard — a diesel pump fault raised and the SMS sent" }
  ],

  faqs: [
    { q: "Will it work with our existing fire equipment?", a: "Yes. FireGuard reads your existing pumps, panels and sensors over RS485 / Modbus or dry contacts. Where a signal is missing, we add the right sensor." },
    { q: "Do we need internet at the site?", a: "The gateway connects over 4G, Ethernet or Wi-Fi and switches automatically. SMS alerts go out over its own 4G link even if the building internet is down." },
    { q: "What happens if the connection drops?", a: "The gateway stores the readings and sends them to the cloud when the connection returns, so nothing is lost." },
    { q: "Does it replace our fire alarm panel?", a: "No. Your fire alarm panel keeps working as it is. FireGuard monitors its fire, fault and supervisory signals and alerts your team remotely." },
    { q: "Can we monitor more than one building?", a: "Yes. All your buildings can be seen under one login, with different access for owners, facility managers and maintenance staff." },
    { q: "How is the price decided?", a: "It depends on how many pumps, panels and other points you want to monitor and how many buildings. Share your details and we will send a quotation for your site." }
  ],

  enquiryQuestions: [
    "Number of buildings / sites",
    "Number of fire pumps (jockey, main, diesel)",
    "Fire alarm panel make / model (if known)",
    "Type of property (hospital, mall, factory…)"
  ],

  seoTitle: "Fire Alarm & Fire Pump Monitoring System | Remote Fire-Fighting Monitoring — FireGuard by Jenix",
  seoDescription:
    "Monitor fire pumps, sprinkler and hydrant pressure, water tank and fire alarm panel 24×7 with instant app and SMS alerts. Works with existing equipment. Get a quote from Jenix India.",
  isPublished: true,
  sortOrder: 3
};

const PROJECTS = [floodguard, fireguard];

(async () => {
  const uploadsDir = path.resolve(process.cwd(), env.uploadDir, "projects");
  const store = await readProjectsStore();
  const now = new Date().toISOString();
  let created = 0;
  for (const project of PROJECTS) {
    const files = [project.heroImageUrl, ...project.gallery.map((g) => g.url)].map((u) => u.split("/").pop());
    const missing = [...new Set(files)].filter((f) => !fs.existsSync(path.join(uploadsDir, f)));
    if (store.projects.some((p) => p.slug === project.slug)) { console.log("exists, skipped:", project.slug); continue; }
    console.log(project.slug, "| missing images:", missing.length ? missing : "none");
    if (!apply) continue;
    if (missing.length) { console.error("images missing — not creating", project.slug); process.exitCode = 1; continue; }
    store.projects.push(sanitizeProject({ ...project, id: generateId("project"), createdAt: now, updatedAt: now }));
    created += 1;
  }
  if (apply && created) { await writeProjectsStore(store); console.log("created:", created); }
  if (!apply) console.log("dry run — pass --apply to write");
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
