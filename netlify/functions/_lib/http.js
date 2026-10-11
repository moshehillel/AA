function json(statusCode, body, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const multiValueHeaders = {};

  for (const [key, value] of Object.entries(extraHeaders)) {
    if (Array.isArray(value)) {
      multiValueHeaders[key] = value;
    } else {
      headers[key] = value;
    }
  }

  const response = {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
  if (Object.keys(multiValueHeaders).length) {
    response.multiValueHeaders = multiValueHeaders;
  }
  return response;
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function methodNotAllowed() {
  return json(405, { error: "Method not allowed" });
}

function getHeader(event, name) {
  const headers = event.headers || {};
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

function siteOrigin(event) {
  const proto = getHeader(event, "x-forwarded-proto") || "https";
  const host = getHeader(event, "x-forwarded-host") || getHeader(event, "host");
  if (host) return `${proto}://${host}`;
  return process.env.URL || process.env.DEPLOY_PRIME_URL || "https://advancedautomations.net";
}

module.exports = {
  json,
  parseBody,
  methodNotAllowed,
  getHeader,
  siteOrigin,
};
