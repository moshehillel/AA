const { json, parseBody, methodNotAllowed, siteOrigin } = require("./_lib/http");
const { requireAdmin } = require("./_lib/auth");
const { initBlobs, getTicketById, saveTicket, publicTicket } = require("./_lib/store");
const { notifyTicketUpdate } = require("./_lib/email");

const ALLOWED = new Set(["open", "in_progress", "waiting_on_customer", "done"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    initBlobs(event);
    const admin = requireAdmin(event);
    if (!admin.ok) {
      return json(admin.status, { error: admin.error });
    }

    const body = parseBody(event);
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim();

    if (!id || !ALLOWED.has(status)) {
      return json(400, { error: "Valid id and status are required." });
    }

    const ticket = await getTicketById(id);
    if (!ticket) return json(404, { error: "Ticket not found." });

    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    await saveTicket(ticket);

    const trackUrl = `${siteOrigin(event)}/t/${ticket.trackToken}/`;
    try {
      await notifyTicketUpdate({
        ticket,
        trackUrl,
        kind: status === "done" ? "done" : "status",
      });
    } catch (emailError) {
      console.error("tickets-status email error:", emailError);
    }

    return json(200, { ticket: publicTicket(ticket), trackUrl });
  } catch (error) {
    console.error("tickets-status error:", error);
    return json(500, { error: "Internal server error" });
  }
};
