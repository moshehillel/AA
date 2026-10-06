const nodemailer = require("nodemailer");

function createTransport() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendMail({ to, subject, html }) {
  const transporter = createTransport();
  if (!transporter) {
    console.warn("Email skipped: GMAIL_USER / GMAIL_APP_PASSWORD not set");
    return { skipped: true };
  }
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    html,
  });
  return { sent: true };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function notifyTicketCreated({ ticket, trackUrl, adminEmail }) {
  const subject = `[Support] New ticket: ${ticket.subject}`;
  const html = `
    <h2>New support ticket</h2>
    <p><strong>Client:</strong> ${escapeHtml(ticket.clientName || ticket.clientSlug)}</p>
    <p><strong>From:</strong> ${escapeHtml(ticket.requesterName)} &lt;${escapeHtml(ticket.requesterEmail)}&gt;</p>
    <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml((ticket.messages && ticket.messages[0] && ticket.messages[0].body) || "")}</p>
    <p><a href="${escapeHtml(trackUrl)}">Open track page</a></p>
    <p><a href="${escapeHtml(trackUrl.replace(/\/t\/.*/, "/admin/"))}">Open admin</a></p>
  `;

  const jobs = [
    sendMail({ to: adminEmail, subject, html }),
  ];
  if (ticket.requesterEmail) {
    jobs.push(
      sendMail({
        to: ticket.requesterEmail,
        subject: `We received your request: ${ticket.subject}`,
        html: `
          <h2>Request received</h2>
          <p>Hi ${escapeHtml(ticket.requesterName || "there")},</p>
          <p>We got your support request and will follow up here.</p>
          <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
          <p>Track status anytime:</p>
          <p><a href="${escapeHtml(trackUrl)}">${escapeHtml(trackUrl)}</a></p>
        `,
      })
    );
  }
  await Promise.allSettled(jobs);
}

async function notifyTicketUpdate({ ticket, trackUrl, kind, body }) {
  if (!ticket.requesterEmail) return;
  const label = kind === "done" ? "marked done" : kind === "status" ? "updated" : "new reply";
  await sendMail({
    to: ticket.requesterEmail,
    subject: `[Support] Ticket ${label}: ${ticket.subject}`,
    html: `
      <h2>Ticket ${escapeHtml(label)}</h2>
      <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
      <p><strong>Status:</strong> ${escapeHtml(ticket.status)}</p>
      ${body ? `<p><strong>Update:</strong></p><p>${escapeHtml(body)}</p>` : ""}
      <p><a href="${escapeHtml(trackUrl)}">View ticket</a></p>
    `,
  });
}

module.exports = {
  sendMail,
  notifyTicketCreated,
  notifyTicketUpdate,
  escapeHtml,
};
