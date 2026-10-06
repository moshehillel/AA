const crypto = require("crypto");
const { getHeader } = require("./http");
const { getClient } = require("./store");
const { verifyPassword } = require("./passwords");

const COOKIE_NAME = "aa_support_session";
const SESSION_DAYS = 14;

function timingSafeEqualString(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireAdmin(event) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false, status: 503, error: "Admin is not configured yet (ADMIN_PASSWORD)." };
  }

  const header = getHeader(event, "authorization");
  if (!header || !header.startsWith("Basic ")) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const password = decoded.slice(separatorIndex + 1);
  if (!timingSafeEqualString(password, expected)) {
    return { ok: false, status: 401, error: "Invalid password." };
  }

  return { ok: true };
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function signPayload(payloadB64) {
  const secret = sessionSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function createSessionToken(slug) {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payloadB64 = Buffer.from(JSON.stringify({ slug, exp }), "utf8").toString("base64url");
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

function parseCookies(event) {
  const raw = getHeader(event, "cookie") || "";
  const out = {};
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return out;
}

function readSession(event) {
  const cookies = parseCookies(event);
  const token = cookies[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  const expected = signPayload(payloadB64);
  if (!expected || !timingSafeEqualString(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload.slug || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionCookie(token, { clear = false, secure = true } = {}) {
  const securePart = secure ? "; Secure" : "";
  if (clear) {
    return `${COOKIE_NAME}=; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=0`;
  }
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=${maxAge}`;
}

async function requireClientSession(event) {
  const session = readSession(event);
  if (!session) {
    return { ok: false, status: 401, error: "Please sign in." };
  }
  const client = await getClient(session.slug);
  if (!client || client.active === false) {
    return { ok: false, status: 401, error: "Client account is inactive or missing." };
  }
  return { ok: true, client, session };
}

async function loginClient(slug, password) {
  const client = await getClient(slug);
  if (!client || client.active === false) {
    return { ok: false, status: 401, error: "Invalid login." };
  }
  if (!verifyPassword(password, client.passwordHash)) {
    return { ok: false, status: 401, error: "Invalid login." };
  }
  const token = createSessionToken(client.slug);
  if (!token) {
    return { ok: false, status: 503, error: "SESSION_SECRET is not configured." };
  }
  return { ok: true, client, token };
}

module.exports = {
  COOKIE_NAME,
  requireAdmin,
  requireClientSession,
  loginClient,
  sessionCookie,
  readSession,
};
