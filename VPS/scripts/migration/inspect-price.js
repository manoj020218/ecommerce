#!/usr/bin/env node
import * as cheerio from "cheerio";
import fs from "fs/promises";

const html = await fs.readFile("./output/page-debug.html", "utf8");
const $ = cheerio.load(html);

// Find the product details offerbox and show its HTML
console.log("\n=== .product-details-offerbox HTML ===");
const offerbox = $(".product-details-offerbox");
console.log("Found:", offerbox.length, "elements");
console.log(offerbox.first().html()?.substring(0, 2000));

console.log("\n=== .productDetails HTML (first 3000 chars) ===");
const pd = $(".productDetails");
console.log("Found:", pd.length, "elements");
console.log(pd.first().html()?.substring(0, 3000));

console.log("\n=== First .zMTJV text ===");
$(".zMTJV").each((i, el) => {
  const text = $(el).text().trim();
  const cls = $(el).attr("class") || "";
  if (i < 10) console.log(`[${i}] class="${cls}" text="${text}"`);
});

console.log("\n=== All .strike-price ===");
$(".strike-price").each((i, el) => {
  const text = $(el).text().trim();
  if (i < 5) console.log(`[${i}] text="${text}"`);
});

console.log("\n=== product-details-curr parent HTML ===");
const curr = $(".product-details-curr").first().parent();
console.log(curr.html()?.substring(0, 500));

console.log("\n=== .product-details-desc HTML ===");
const desc = $(".product-details-desc");
console.log("Found:", desc.length, "elements");
console.log(desc.first().text()?.substring(0, 500));
