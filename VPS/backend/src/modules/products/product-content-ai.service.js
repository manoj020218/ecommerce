const { HttpError } = require("../../common/http-error");
const { readIntegrationsStore } = require("../../database/integrations-store");

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = `You are a catalogue content assistant for Jenix India, an Indian electronics/IoT/security-hardware retailer (locks, cameras, routers, access control, and similar products).

Given a product's title, brand, model number, and existing description text, produce a JSON object with exactly these keys:

- "keyFeatures": an array of 4 to 7 short, scannable bullet points (each under 90 characters). Each bullet is a concrete buying reason grounded ONLY in what the given text actually states or clearly implies. No generic marketing filler like "Great quality" or "Best in class".
- "specifications": a flat JSON object of technical spec name -> value pairs (e.g. "Material", "Operating Voltage", "Dimensions", "Compatibility", "Warranty"). Include a spec ONLY if its value is explicitly stated or very confidently inferable from the given text. Never invent or estimate a numeric, electrical, or safety-relevant value (voltage, current, weight capacity, IP rating, etc.) that isn't actually present in the source text — omit that spec entirely instead of guessing.
- "warnings": an array of short strings noting anything a human should double-check (e.g. specs the source text didn't cover, ambiguous claims).

Respond with ONLY the JSON object, no other text.`;

function buildUserPrompt(product) {
  const lines = [
    `Title: ${product.title || ""}`,
    product.brand ? `Brand: ${product.brand}` : "",
    product.modelNumber ? `Model Number: ${product.modelNumber}` : "",
    product.shortDescription ? `Short Description: ${stripHtml(product.shortDescription)}` : "",
    product.fullDescription ? `Full Description: ${stripHtml(product.fullDescription)}` : "",
    Array.isArray(product.technicalKeywords) && product.technicalKeywords.length
      ? `Technical Keywords: ${product.technicalKeywords.join(", ")}`
      : "",
    Array.isArray(product.useCases) && product.useCases.length
      ? `Use Cases: ${product.useCases.join(", ")}`
      : ""
  ].filter(Boolean);

  return lines.join("\n");
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeDraft(raw) {
  const keyFeatures = Array.isArray(raw?.keyFeatures)
    ? raw.keyFeatures.map((f) => String(f).trim()).filter(Boolean).slice(0, 10)
    : [];

  const specifications = {};
  if (raw?.specifications && typeof raw.specifications === "object" && !Array.isArray(raw.specifications)) {
    for (const [key, value] of Object.entries(raw.specifications)) {
      const cleanKey = String(key).trim();
      const cleanValue = String(value ?? "").trim();
      if (cleanKey && cleanValue) {
        specifications[cleanKey] = cleanValue;
      }
    }
  }

  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings.map((w) => String(w).trim()).filter(Boolean)
    : [];

  return { keyFeatures, specifications, warnings };
}

async function generateProductContentDraft(product) {
  const store = await readIntegrationsStore();
  const config = store.integrations?.aiContentAssistant || {};

  if (!config.enabled || !config.apiKey) {
    throw new HttpError(
      400,
      "AI Content Assistant is not configured. Add an OpenAI API key under Settings → Integrations → AI Content Assistant."
    );
  }

  const model = config.model || "gpt-4o-mini";

  let response;
  try {
    response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(product) }
        ]
      })
    });
  } catch (networkError) {
    throw new HttpError(502, `Could not reach OpenAI: ${networkError.message}`);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed (HTTP ${response.status}).`;
    throw new HttpError(502, message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, "OpenAI returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(502, "Could not parse the AI response as JSON. Try again.");
  }

  return sanitizeDraft(parsed);
}

module.exports = { generateProductContentDraft };
