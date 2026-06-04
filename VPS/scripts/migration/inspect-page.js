#!/usr/bin/env node
/**
 * Dumps key structural elements from a product page to understand selectors.
 * Usage: node inspect-page.js
 */
import pkg from "./node_modules/playwright/index.js";
const { chromium } = pkg;
import * as cheerio from "cheerio";
import fs from "fs/promises";

const URL = "https://jenixindia.com/products/jenix-electronic-door-lock-suitable-for-outdoor-main-gate-wood-gate-villa-flate-for-electric-lock-security-system-rim-lock";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
const html = await page.content();
await browser.close();

// Save full HTML for reference
await fs.writeFile("./output/page-debug.html", html);
console.log("Full HTML saved to output/page-debug.html");

const $ = cheerio.load(html);

// Dump all h1, h2, h3 tags
console.log("\n=== HEADINGS ===");
$("h1, h2, h3").each((i, el) => {
  const cls = $(el).attr("class") || "";
  const id = $(el).attr("id") || "";
  const text = $(el).text().trim().substring(0, 120);
  console.log(`<${el.tagName} class="${cls}" id="${id}"> ${text}`);
});

// Dump anything containing ₹ or price-like text
console.log("\n=== PRICE-LIKE ELEMENTS ===");
$("*").each((i, el) => {
  const text = $(el).clone().children().remove().end().text().trim();
  if (text.includes("₹") || text.match(/^\d{2,6}$/) || text.toLowerCase().includes("price") || text.toLowerCase().includes("mrp")) {
    if (text.length < 200 && el.children && el.children.length < 5) {
      const cls = $(el).attr("class") || "";
      const tag = el.tagName;
      console.log(`<${tag} class="${cls}"> "${text.substring(0, 100)}"`);
    }
  }
});

// Show what classes have "product" in them
console.log("\n=== PRODUCT-NAMED CLASSES ===");
const classes = new Set();
$("[class]").each((i, el) => {
  const cls = $(el).attr("class") || "";
  cls.split(/\s+/).forEach(c => {
    if (c.match(/product|price|title|name|desc|spec|img|gallery|mrp/i)) {
      classes.add(`${el.tagName}.${c}`);
    }
  });
});
[...classes].sort().forEach(c => console.log(c));

// Show images and their src
console.log("\n=== ALL IMG TAGS ===");
$("img").each((i, el) => {
  const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "";
  const cls = $(el).attr("class") || "";
  const alt = $(el).attr("alt") || "";
  if (src && !src.includes("data:")) {
    console.log(`img[class="${cls}"] alt="${alt}" src="${src.substring(0, 100)}"`);
  }
});
