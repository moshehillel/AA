const { json, methodNotAllowed } = require("./_lib/http");
const { requireAdmin, requireClientSession } = require("./_lib/auth");
const { initBlobs, listTickets, publicTicket } = require("./_lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    initBlobs(event);
    const params = event.queryStringParameters || {};
    const status = params.status ? String(params.status) : null;

    const admin = requireAdmin(event);
    if (admin.ok) {
      let tickets = await listTickets();
      if (status && status !== "all") {
        tickets = tickets.filter((t) => t.status === status);
      }
      if (params.clientSlug) {
        tickets = tickets.filter((t) => t.clientSlug === params.clientSlug);
      }
      return json(200, { tickets: tickets.map(publicTicket), role: "admin" });
    }

    const clientAuth = await requireClientSession(event);
    if (!clientAuth.ok) {
      return json(401, { error: "Authentication required." });
    }

    let tickets = (await listTickets()).filter(
      (t) => t.clientSlug === clientAuth.client.slug
    );
    if (status && status !== "all") {
      tickets = tickets.filter((t) => t.status === status);
    }
    return json(200, { tickets: tickets.map(publicTicket), role: "client" });
  } catch (error) {
    console.error("tickets-list error:", error);
    return json(500, { error: "Internal server error" });
  }
};
