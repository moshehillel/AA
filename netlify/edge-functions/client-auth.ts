import type { Context } from "https://edge.netlify.com";

// Slugs that map to a client dashboard, e.g. "innovative-carriers" ->
// www.advancedautomations.net/innovative-carriers. Keep this in sync with
// dashboard/clients.js, which holds the richer per-client config (display
// name, Functions backend URL) used by the frontend. Adding a slug here is
// what turns on the password gate for it — you'll also need a matching
// CLIENT_<SLUG>_PASSWORD env var in Netlify (Site configuration >
// Environment variables, hyphens in the slug become underscores, e.g.
// CLIENT_INNOVATIVE_CARRIERS_PASSWORD) or the dashboard responds with 503
// until one is set.
const CLIENT_SLUGS = ["innovative-carriers"];

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments[0];

  // The dashboard template only exists to be rewritten into from an
  // authenticated "/<slug>" path below — block direct access to it.
  if (slug === "dashboard") {
    return new Response("Not found", { status: 404 });
  }

  if (!slug || !CLIENT_SLUGS.includes(slug)) {
    return context.next();
  }

  const envKey = `CLIENT_${slug.toUpperCase().replace(/-/g, "_")}_PASSWORD`;
  const expectedPassword = Deno.env.get(envKey);
  if (!expectedPassword) {
    return new Response("This dashboard is not configured yet.", { status: 503 });
  }

  if (!isAuthorized(request.headers.get("authorization"), expectedPassword)) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${slug} dashboard", charset="UTF-8"`,
        "Content-Type": "text/plain",
      },
    });
  }

  const rest = segments.slice(1).join("/");
  return context.rewrite(rest ? `/dashboard/${rest}` : "/dashboard/index.html");
};

function isAuthorized(header: string | null, expectedPassword: string): boolean {
  if (!header || !header.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  // Username is ignored — each client gets a single shared password.
  const password = decoded.slice(separatorIndex + 1);
  return timingSafeEqual(password, expectedPassword);
}

// Avoids leaking the password length/contents through comparison-time
// differences. Length is checked up front (a minor, accepted leak — full
// constant-time-regardless-of-length comparison isn't worth the complexity
// for this threat model).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const config = { path: "/*" };
