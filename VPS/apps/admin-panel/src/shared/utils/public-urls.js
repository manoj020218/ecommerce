export function normalizePublicBaseUrl(value) {
  const baseUrl = String(value || "").trim().replace(/\/+$/, "");

  if (!baseUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(baseUrl)) {
    return baseUrl;
  }

  return `https://${baseUrl}`;
}

export function buildPublicSiteUrl(canonicalDomain, pathname = "") {
  const baseUrl = normalizePublicBaseUrl(canonicalDomain);

  if (!baseUrl) {
    return "";
  }

  if (!pathname) {
    return baseUrl;
  }

  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}
