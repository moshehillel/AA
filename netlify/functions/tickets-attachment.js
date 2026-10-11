const { json, methodNotAllowed } = require("./_lib/http");
const { requireAdmin, requireClientSession } = require("./_lib/auth");
const {
  initBlobs,
  getTicketById,
  getTicketByToken,
  getAttachmentBinary,
  findAttachmentOnTicket,
} = require("./_lib/store");

function binaryResponse(buffer, contentType, filename, download) {
  const disposition = download
    ? `attachment; filename="${String(filename || "file").replace(/"/g, "")}"`
    : `inline; filename="${String(filename || "file").replace(/"/g, "")}"`;
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    },
    body: Buffer.from(buffer).toString("base64"),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    initBlobs(event);
    const params = event.queryStringParameters || {};
    const attachmentId = params.attachmentId ? String(params.attachmentId) : "";
    const trackToken = params.trackToken ? String(params.trackToken) : "";
    const ticketId = params.id ? String(params.id) : "";
    const download = params.download === "1" || params.download === "true";

    if (!attachmentId) {
      return json(400, { error: "attachmentId is required." });
    }

    let ticket = null;
    if (trackToken) {
      ticket = await getTicketByToken(trackToken);
    } else if (ticketId) {
      ticket = await getTicketById(ticketId);
      if (ticket) {
        const admin = requireAdmin(event);
        if (!admin.ok) {
          const clientAuth = await requireClientSession(event);
          if (!clientAuth.ok || clientAuth.client.slug !== ticket.clientSlug) {
            return json(401, { error: "Authentication required." });
          }
        }
      }
    } else {
      return json(400, { error: "trackToken or id is required." });
    }

    if (!ticket) return json(404, { error: "Ticket not found." });

    const meta = findAttachmentOnTicket(ticket, attachmentId);
    if (!meta) return json(404, { error: "Attachment not found." });

    const binary = await getAttachmentBinary(ticket.id, attachmentId);
    if (!binary) return json(404, { error: "Attachment file missing." });

    return binaryResponse(
      binary.buffer,
      meta.contentType || binary.contentType,
      meta.filename,
      download
    );
  } catch (error) {
    console.error("tickets-attachment error:", error);
    return json(500, { error: "Internal server error" });
  }
};
