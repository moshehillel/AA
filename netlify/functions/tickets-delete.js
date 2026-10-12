const { json, parseBody, methodNotAllowed } = require("./_lib/http");
const { requireAdmin } = require("./_lib/auth");
const { initBlobs, getTicketById, deleteTicket } = require("./_lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST" && event.httpMethod !== "DELETE") {
    return methodNotAllowed();
  }

  try {
    initBlobs(event);
    const admin = requireAdmin(event);
    if (!admin.ok) {
      return json(admin.status, { error: admin.error });
    }

    const body = event.httpMethod === "DELETE" ? {} : parseBody(event);
    const params = event.queryStringParameters || {};
    const id = String(body.id || params.id || "").trim();
    if (!id) {
      return json(400, { error: "Ticket id is required." });
    }

    const ticket = await getTicketById(id);
    if (!ticket) return json(404, { error: "Ticket not found." });

    await deleteTicket(ticket);
    return json(200, { success: true, id });
  } catch (error) {
    console.error("tickets-delete error:", error);
    return json(500, { error: "Internal server error" });
  }
};
