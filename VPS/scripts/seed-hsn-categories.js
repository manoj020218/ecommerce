#!/usr/bin/env node
/**
 * seed-hsn-categories.js
 * Run from VPS/ directory: node scripts/seed-hsn-categories.js [--dry-run]
 *
 * Creates HSN Tax Master records and ensures categories have descriptions/sort order.
 */

"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { readCatalogStore, writeCatalogStore } = require("../backend/src/database/catalog-store");
const { generateId } = require("../backend/src/common/identity");

const isDryRun = process.argv.includes("--dry-run");
const NOW = new Date().toISOString();
const EFFECTIVE_FROM = "2024-01-01";

// ── HSN Tax Master records ────────────────────────────────────────────────────
const HSN_RECORDS = [
  {
    hsnCode: "8531",
    description: "Electric sound or visual signalling apparatus — burglar alarms, fire alarms, smart locks, access control panels, sirens, door bells, visual indicators",
    gstRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    effectiveFrom: EFFECTIVE_FROM,
    isActive: true
  },
  {
    hsnCode: "8529",
    description: "Parts suitable for use with apparatus of headings 8525–8528 — CCTV cameras, surveillance equipment, NVR/DVR, camera brackets and accessories",
    gstRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    effectiveFrom: EFFECTIVE_FROM,
    isActive: true
  },
  {
    hsnCode: "85176290",
    description: "Other apparatus for the transmission or reception of voice, images or other data — smart home devices, IoT controllers, WiFi smart switches, Tuya devices, video door phones",
    gstRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    effectiveFrom: EFFECTIVE_FROM,
    isActive: true
  },
  {
    hsnCode: "8417",
    description: "Industrial or laboratory furnaces and ovens, including incinerators — electronic components, diodes, circuit boards, robotics components",
    gstRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    effectiveFrom: EFFECTIVE_FROM,
    isActive: true
  }
];

// ── Category descriptions and sort order ─────────────────────────────────────
const CATEGORY_META = {
  "Access Control":       { description: "RFID readers, keypads, fingerprint scanners, access control kits and cards", sortOrder: 1 },
  "Smart Home Automation":{ description: "Smart switches, WiFi relays, Tuya smart home devices, automation controllers", sortOrder: 2 },
  "Surveilliance":        { description: "CCTV cameras, NVR/DVR, camera mounts, IP cameras and surveillance accessories", sortOrder: 3 },
  "Security Alarm System":{ description: "Sirens, motion sensors, door/window sensors, burglar alarms", sortOrder: 4 },
  "Intercom and PABX":    { description: "Video door phones, audio intercoms, EPABX telephone systems", sortOrder: 5 },
  "Parking Management":   { description: "Boom barriers, ANPR cameras, UHF RFID readers, vehicle access systems", sortOrder: 6 },
  "Power Supply":         { description: "SMPS power supplies, adaptors, inverters, industrial power units", sortOrder: 7 },
  "Cable and Connector":  { description: "HDMI cables, RJ45 tools, patch cords, connectors and wiring accessories", sortOrder: 8 },
  "Network and Periferrals":{ description: "POE switches, extenders, routers, network accessories", sortOrder: 9 },
  "Hotel Industries":     { description: "TTlock hotel locks, RFID hotel card systems, lift control cards", sortOrder: 10 },
  "4G Router":            { description: "4G/LTE routers, SIM-based routers, mobile broadband devices", sortOrder: 11 },
  "Robotics":             { description: "Electronic components, diodes, robotics parts and accessories", sortOrder: 12 }
};

async function main() {
  const store = await readCatalogStore();

  // ── 1. Create / skip HSN records ────────────────────────────────────────────
  const existingHsn = new Set((store.hsnTaxMaster || []).map(r => r.hsnCode));
  const toAddHsn = HSN_RECORDS.filter(r => !existingHsn.has(r.hsnCode));
  const alreadyHsn = HSN_RECORDS.filter(r => existingHsn.has(r.hsnCode));

  console.log(`\n=== HSN Tax Master ===`);
  console.log(`Existing: ${existingHsn.size} | To create: ${toAddHsn.length} | Already exist: ${alreadyHsn.length}`);

  for (const rec of toAddHsn) {
    const entry = {
      id: generateId("hsn"),
      ...rec,
      createdAt: NOW,
      updatedAt: NOW
    };
    console.log(`  + ${rec.hsnCode} — ${rec.description.slice(0, 70)}...`);
    if (!isDryRun) {
      if (!store.hsnTaxMaster) store.hsnTaxMaster = [];
      store.hsnTaxMaster.push(entry);
    }
  }
  for (const rec of alreadyHsn) {
    console.log(`  = ${rec.hsnCode} already exists — skipped`);
  }

  // ── 2. Update category descriptions and sort orders ─────────────────────────
  console.log(`\n=== Categories ===`);
  let catsUpdated = 0;

  for (const cat of (store.categories || [])) {
    const meta = CATEGORY_META[cat.name];
    if (!meta) { console.log(`  ? ${cat.name} — no metadata defined`); continue; }

    const needsUpdate = !cat.description || cat.sortOrder === undefined;
    if (needsUpdate) {
      console.log(`  ~ ${cat.name} — add description + sortOrder ${meta.sortOrder}`);
      if (!isDryRun) {
        cat.description = meta.description;
        cat.sortOrder = meta.sortOrder;
        cat.updatedAt = NOW;
        catsUpdated++;
      }
    } else {
      console.log(`  = ${cat.name} (order ${cat.sortOrder}) — already has description`);
    }
  }

  // ── 3. Save ─────────────────────────────────────────────────────────────────
  if (!isDryRun && (toAddHsn.length > 0 || catsUpdated > 0)) {
    await writeCatalogStore(store);
  }

  console.log(`\n=== ${isDryRun ? "DRY RUN" : "COMPLETE"} ===`);
  console.log(`  HSN records created:    ${toAddHsn.length}`);
  console.log(`  Categories updated:     ${isDryRun ? "?" : catsUpdated}`);
  if (isDryRun) console.log("  Run without --dry-run to apply.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
