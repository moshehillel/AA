const { json, parseBody, methodNotAllowed, siteOrigin } = require("./_lib/http");
const { requireClientSession } = require("./_lib/auth");
const { initBlobs, saveTicket, saveAttachmentBinary, publicTicket } = require("./_lib/store");
const { randomToken } = require("./_lib/passwords");
const { notifyTicketCreated } = require("./_lib/email");
const { parseIncomingAttachments, publicAttachmentMeta } = require("./_lib/attachments");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    initBlobs(event);
    const auth = await requireClientSession(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const body = parseBody(event);
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const requesterName =
      String(body.requesterName || "").trim() ||
      String(auth.client.defaultName || "").trim() ||
      String(auth.client.name || "").trim();
    const requesterEmail =
      String(body.requesterEmail || "").trim() ||
      String(auth.client.defaultEmail || "").trim();

    const parsedAttachments = parseIncomingAttachments(body.attachments);
    if (!parsedAttachments.ok) {
      return json(400, { error: parsedAttachments.error });
    }

    if (!subject) {
      return json(400, { error: "Subject is required." });
    }
    if (!message && !parsedAttachments.files.length) {
      return json(400, { error: "Message or attachment is required." });
    }
    if (!requesterName) {
      return json(400, {
        error: "Name is required (or set a default contact name for this client in admin).",
      });
    }
    if (!requesterEmail) {
      return json(400, {
        error: "Email is required (or set a default contact email for this client in admin).",
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      return json(400, { error: "Invalid email format." });
    }

    const now = new Date().toISOString();
    const ticketId = randomToken(12);
    const messageId = randomToken(8);
    const attachments = parsedAttachments.files.map(publicAttachmentMeta);

    for (const file of parsedAttachments.files) {
      await saveAttachmentBinary(ticketId, file);
    }

    const ticket = {
      id: ticketId,
      trackToken: randomToken(24),
      clientSlug: auth.client.slug,
      clientName: auth.client.name,
      requesterName,
      requesterEmail,
      subject,
      status: "open",
      messages: [
        {
          id: messageId,
          author: "client",
          body: message || "(Attachment only)",
          createdAt: now,
          attachments,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    await saveTicket(ticket);

    const origin = siteOrigin(event);
    const trackUrl = `${origin}/t/${ticket.trackToken}/`;
    const adminEmail = process.env.SUPPORT_NOTIFY_EMAIL || "mshglck@gmail.com";

    try {
      await notifyTicketCreated({ ticket, trackUrl, adminEmail });
    } catch (emailError) {
      console.error("tickets-create email error:", emailError);
    }

    return json(201, {
      ticket: publicTicket(ticket),
      trackUrl,
    });
  } catch (error) {
    console.error("tickets-create error:", error);
    return json(500, { error: "Internal server error" });
  }
};
