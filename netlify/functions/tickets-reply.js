const { json, parseBody, methodNotAllowed, siteOrigin } = require("./_lib/http");
const { requireAdmin, requireClientSession } = require("./_lib/auth");
const {
  getTicketById,
  getTicketByToken,
  saveTicket,
  publicTicket,
} = require("./_lib/store");
const { randomToken } = require("./_lib/passwords");
const { notifyTicketUpdate } = require("./_lib/email");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const body = parseBody(event);
    const message = String(body.message || "").trim();
    if (!message) return json(400, { error: "Message is required." });

    let ticket = null;
    let author = null;

    if (body.trackToken) {
      ticket = await getTicketByToken(String(body.trackToken));
      if (!ticket) return json(404, { error: "Ticket not found." });
      author = "client";
    } else {
      const id = String(body.id || "").trim();
      if (!id) return json(400, { error: "id or trackToken is required." });
      ticket = await getTicketById(id);
      if (!ticket) return json(404, { error: "Ticket not found." });

      const admin = requireAdmin(event);
      if (admin.ok) {
        author = "admin";
      } else {
        const clientAuth = await requireClientSession(event);
        if (!clientAuth.ok || clientAuth.client.slug !== ticket.clientSlug) {
          return json(401, { error: "Authentication required." });
        }
        author = "client";
      }
    }

    if (ticket.status === "done" && author === "client") {
      // Allow client follow-up to reopen
      ticket.status = "open";
    } else if (author === "admin" && ticket.status === "open") {
      ticket.status = "in_progress";
    }

    const now = new Date().toISOString();
    ticket.messages = ticket.messages || [];
    ticket.messages.push({
      id: randomToken(8),
      author,
      body: message,
      createdAt: now,
    });
    ticket.updatedAt = now;
    await saveTicket(ticket);

    const trackUrl = `${siteOrigin(event)}/t/${ticket.trackToken}/`;
    if (author === "admin") {
      try {
        await notifyTicketUpdate({
          ticket,
          trackUrl,
          kind: "reply",
          body: message,
        });
      } catch (emailError) {
        console.error("tickets-reply email error:", emailError);
      }
    }

    return json(200, { ticket: publicTicket(ticket), trackUrl });
  } catch (error) {
    console.error("tickets-reply error:", error);
    return json(500, { error: "Internal server error" });
  }
};
