const { HttpError } = require("../../common/http-error");
const { readIntegrationsStore } = require("../../database/integrations-store");

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `You are a catalogue content assistant for Jenix India, an Indian electronics/IoT/security-hardware retailer (locks, cameras, routers, access control, and similar products).

Given a product's title, brand, model number, and existing description text, produce a JSON object with exactly these keys:

- "keyFeatures": an array of 4 to 7 short, scannable bullet points (each under 90 characters). Each bullet is a concrete buying reason grounded ONLY in what the given text actually states or clearly implies. No generic marketing filler like "Great quality" or "Best in class".
- "specifications": a flat JSON object of technical spec name -> value pairs (e.g. "Material", "Operating Voltage", "Dimensions", "Compatibility", "Warranty"). Include a spec ONLY if its value is explicitly stated or very confidently inferable from the given text. Never invent or estimate a numeric, electrical, or safety-relevant value (voltage, current, weight capacity, IP rating, etc.) that isn't actually present in the source text — omit that spec entirely instead of guessing.
- "technicalKeywords": an array of 4 to 8 short technical search terms a buyer or search engine might use (e.g. "relay", "24vdc", "10a", "din rail").
- "customerKeywords": an array of 4 to 8 short everyday phrases a customer (not an engineer) might type when searching for this product.
- "useCases": an array of 3 to 6 short phrases describing where/how this product is typically used.
- "problemStatements": an array of 2 to 5 short phrases describing the problem this product solves for a buyer.
- "metaTitle": an SEO meta title, 50-60 characters, including the core product type.
- "metaDescription": an SEO meta description, 140-160 characters, written to earn a click from a search results page.
- "warnings": an array of short strings noting anything a human should double-check (e.g. specs the source text didn't cover, ambiguous claims).

Respond with ONLY the JSON object, no markdown code fences, no other text.`;

function buildUserPrompt(product) {
  const lines = [
    `Title: ${product.title || ""}`,
    product.brand ? `Brand: ${product.brand}` : "",
    product.modelNumber ? `Model Number: ${product.modelNumber}` : "",
    product.shortDescription ? `Short Description: ${stripHtml(product.shortDescription)}` : "",
    product.fullDescription ? `Full Description: ${stripHtml(product.fullDescription)}` : "",
    Array.isArray(product.technicalKeywords) && product.technicalKeywords.length
      ? `Existing Technical Keywords: ${product.technicalKeywords.join(", ")}`
      : "",
    Array.isArray(product.useCases) && product.useCases.length
      ? `Existing Use Cases: ${product.useCases.join(", ")}`
      : ""
  ].filter(Boolean);

  return lines.join("\n");
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function stripJsonFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function sanitizeStringArray(value, max, maxLen) {
  return Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean).slice(0, max).map((v) => v.slice(0, maxLen))
    : [];
}

function sanitizeDraft(raw) {
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

  return {
    keyFeatures: sanitizeStringArray(raw?.keyFeatures, 10, 240),
    specifications,
    technicalKeywords: sanitizeStringArray(raw?.technicalKeywords, 12, 60),
    customerKeywords: sanitizeStringArray(raw?.customerKeywords, 12, 60),
    useCases: sanitizeStringArray(raw?.useCases, 8, 100),
    problemStatements: sanitizeStringArray(raw?.problemStatements, 6, 140),
    metaTitle: String(raw?.metaTitle || "").trim().slice(0, 70),
    metaDescription: String(raw?.metaDescription || "").trim().slice(0, 200),
    warnings: sanitizeStringArray(raw?.warnings, 10, 200)
  };
}

// Both providers can be configured; OpenAI is preferred if both are enabled
// (arbitrary but stable choice — admins who want Claude instead should
// disable the OpenAI card).
function resolveProvider(integrations) {
  const openai = integrations?.aiContentAssistant;
  if (openai?.enabled && openai?.apiKey) {
    return { provider: "openai", config: openai };
  }
  const claude = integrations?.claudeAssistant;
  if (claude?.enabled && claude?.apiKey) {
    return { provider: "claude", config: claude };
  }
  return null;
}

async function callOpenAI(config, userPrompt) {
  let response;
  try {
    response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
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
  return content;
}

async function callClaude(config, userPrompt) {
  let response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: JSON.stringify({
        model: config.model || "claude-sonnet-5",
        max_tokens: 1500,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }]
      })
    });
  } catch (networkError) {
    throw new HttpError(502, `Could not reach Claude: ${networkError.message}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `Claude request failed (HTTP ${response.status}).`;
    throw new HttpError(502, message);
  }

  const content = payload?.content?.[0]?.text;
  if (!content) {
    throw new HttpError(502, "Claude returned an empty response.");
  }
  return content;
}

async function generateProductContentDraft(product) {
  const store = await readIntegrationsStore();
  const resolved = resolveProvider(store.integrations);

  if (!resolved) {
    throw new HttpError(
      400,
      "No AI provider is configured. Add an OpenAI or Claude API key under Settings → Integrations → AI Assistant Accounts."
    );
  }

  const userPrompt = buildUserPrompt(product);
  const rawContent =
    resolved.provider === "openai"
      ? await callOpenAI(resolved.config, userPrompt)
      : await callClaude(resolved.config, userPrompt);

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawContent));
  } catch {
    throw new HttpError(502, "Could not parse the AI response as JSON. Try again.");
  }

  return sanitizeDraft(parsed);
}

module.exports = { generateProductContentDraft };
