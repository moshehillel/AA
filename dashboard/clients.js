// Client registry — maps a URL slug (e.g. "/innovative-carriers") to that
// client's dashboard config. This is the single source of truth for the
// frontend; the Edge Function in netlify/edge-functions/client-auth.ts has
// its own short list of valid slugs (CLIENT_SLUGS) used to decide which
// paths to gate.
//
// Each client must declare:
//   name              — shown in the dashboard header
//   functionsBaseUrl  — Cloud Functions host (no trailing slash)
//   tenantId          — Firestore tenants/{id} doc (use "default" for Primus)
//   tms               — "primus" or "tai" (shown as a badge; routes workflow)
//
// To add a new client with slug "acme-co":
//   1. Add an entry below
//   2. Add "acme-co" to CLIENT_SLUGS in netlify/edge-functions/client-auth.ts
//   3. In Netlify set CLIENT_ACME_CO_PASSWORD (hyphens → underscores)
//   4. Create tenants/acme-co in Firestore with matching tms + gmailDocId
window.CLIENTS = {
  "innovative-carriers": {
    name: "Innovative Carriers",
    functionsBaseUrl:
      "https://us-central1-tai-invoice-automation.cloudfunctions.net",
    tenantId: "default",
    tms: "primus",
  },
  "ctc": {
    name: "Coast to Coast Carriers",
    functionsBaseUrl:
      "https://us-central1-tai-invoice-automation.cloudfunctions.net",
    tenantId: "ctc",
    tms: "tai",
  },
};
