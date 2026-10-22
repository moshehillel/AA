const { json, parseBody, methodNotAllowed, siteOrigin } = require("./_lib/http");
const { requireAdmin, requireClientSession } = require("./_lib/auth");
const {
  initBlobs,
  getTicketById,
  getTicketByToken,
  saveTicket,
  saveAttachmentBinary,
  publicTicket,
} = require("./_lib/store");
const { randomToken } = require("./_lib/passwords");
const { notifyTicketUpdate } = require("./_lib/email");
const { parseIncomingAttachments, publicAttachmentMeta } = require("./_lib/attachments");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    initBlobs(event);
    const body = parseBody(event);
    const message = String(body.message || "").trim();
    const parsedAttachments = parseIncomingAttachments(body.attachments);
    if (!parsedAttachments.ok) {
      return json(400, { error: parsedAttachments.error });
    }
    if (!message && !parsedAttachments.files.length) {
      return json(400, { error: "Message or attachment is required." });
    }

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

      const clientAuth = await requireClientSession(event);
      if (clientAuth.ok) {
        if (clientAuth.client.slug !== ticket.clientSlug) {
          return json(403, { error: "Not allowed to reply on this ticket." });
        }
        author = "client";
      } else {
        const admin = requireAdmin(event);
        if (!admin.ok) {
          return json(401, { error: "Authentication required." });
        }
        author = "admin";
      }
    }

    if (ticket.status === "done" && author === "client") {
      ticket.status = "open";
    } else if (author === "client" && ticket.status === "waiting_on_customer") {
      ticket.status = "in_progress";
    } else if (author === "admin" && ticket.status !== "done") {
      // Admin replies move the ball to the customer so they know a response is waiting.
      ticket.status = "waiting_on_customer";
    }

    const now = new Date().toISOString();
    const attachments = parsedAttachments.files.map(publicAttachmentMeta);
    for (const file of parsedAttachments.files) {
      await saveAttachmentBinary(ticket.id, file);
    }

    ticket.messages = ticket.messages || [];
    ticket.messages.push({
      id: randomToken(8),
      author,
      body: message || "(Attachment only)",
      createdAt: now,
      attachments,
    });
    ticket.updatedAt = now;
    await saveTicket(ticket);

    const trackUrl = `${siteOrigin(event)}/t/${ticket.trackToken}/`;
    const public = publicTicket(ticket);

    if (author === "admin") {
      // Return to the UI immediately; send the customer email in the background.
      notifyTicketUpdate({
        ticket,
        trackUrl,
        kind: "reply",
        body: message || "Sent an attachment",
      }).catch((emailError) => {
        console.error("tickets-reply email error:", emailError);
      });
    }

    return json(200, { ticket: public, trackUrl });
  } catch (error) {
    console.error("tickets-reply error:", error);
    return json(500, { error: "Internal server error" });
  }
};
