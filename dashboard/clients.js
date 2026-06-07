// Client registry — maps a URL slug (e.g. "/innovative-carriers") to that
// client's dashboard config. This is the single source of truth for the
// frontend; the Edge Function in netlify/edge-functions/client-auth.ts has
// its own short list of valid slugs (CLIENT_SLUGS) used to decide which
// paths to gate.
//
// To add a new client with slug "acme-co":
//   1. Add an entry below with their display name and Functions base URL
//      (the host portion of any of their Cloud Function URLs).
//   2. Add "acme-co" to CLIENT_SLUGS in netlify/edge-functions/client-auth.ts
//   3. In Netlify (Site configuration > Environment variables) set
//      CLIENT_ACME_CO_PASSWORD (hyphens become underscores, uppercased)
//      to that client's dashboard password.
window.CLIENTS = {
  "innovative-carriers": {
    name: "Innovative Carriers",
    functionsBaseUrl: "https://us-central1-tai-invoice-automation.cloudfunctions.net",
  },
};
