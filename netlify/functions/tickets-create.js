const { json, parseBody, methodNotAllowed, siteOrigin } = require("./_lib/http");
const { requireClientSession } = require("./_lib/auth");
const { saveTicket, publicTicket } = require("./_lib/store");
const { randomToken } = require("./_lib/passwords");
const { notifyTicketCreated } = require("./_lib/email");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const auth = await requireClientSession(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const body = parseBody(event);
    const requesterName = String(body.requesterName || "").trim();
    const requesterEmail = String(body.requesterEmail || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();

    if (!requesterName || !requesterEmail || !subject || !message) {
      return json(400, { error: "Name, email, subject, and message are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      return json(400, { error: "Invalid email format." });
    }

    const now = new Date().toISOString();
    const ticket = {
      id: randomToken(12),
      trackToken: randomToken(24),
      clientSlug: auth.client.slug,
      clientName: auth.client.name,
      requesterName,
      requesterEmail,
      subject,
      status: "open",
      messages: [
        {
          id: randomToken(8),
          author: "client",
          body: message,
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    await saveTicket(ticket);

    const origin = siteOrigin(event);
    const trackUrl = `${origin}/t/${ticket.trackToken}/`;
    const adminEmail = process.env.SUPPORT_NOTIFY_EMAIL || "info@advancedautomations.net";

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
