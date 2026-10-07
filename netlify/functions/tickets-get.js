const { json, methodNotAllowed } = require("./_lib/http");
const { requireAdmin, requireClientSession } = require("./_lib/auth");
const { initBlobs, getTicketById, getTicketByToken, publicTicket } = require("./_lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    initBlobs(event);
    const params = event.queryStringParameters || {};
    const trackToken = params.trackToken ? String(params.trackToken) : null;
    const id = params.id ? String(params.id) : null;

    if (trackToken) {
      const ticket = await getTicketByToken(trackToken);
      if (!ticket) return json(404, { error: "Ticket not found." });
      return json(200, { ticket: publicTicket(ticket) });
    }

    if (!id) {
      return json(400, { error: "id or trackToken is required." });
    }

    const ticket = await getTicketById(id);
    if (!ticket) return json(404, { error: "Ticket not found." });

    const admin = requireAdmin(event);
    if (admin.ok) {
      return json(200, { ticket: publicTicket(ticket), role: "admin" });
    }

    const clientAuth = await requireClientSession(event);
    if (!clientAuth.ok || clientAuth.client.slug !== ticket.clientSlug) {
      return json(401, { error: "Authentication required." });
    }

    return json(200, { ticket: publicTicket(ticket), role: "client" });
  } catch (error) {
    console.error("tickets-get error:", error);
    return json(500, { error: "Internal server error" });
  }
};
