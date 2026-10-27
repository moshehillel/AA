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

const DEFAULT_FROM =
  '"Advanced Automations Support" <no-reply@advancedautomations.net>';

async function sendMail({ to, subject, html }) {
  const transporter = createTransport();
  if (!transporter) {
    console.warn("Email skipped: GMAIL_USER / GMAIL_APP_PASSWORD not set");
    return { skipped: true };
  }

  const preferredFrom = process.env.MAIL_FROM || DEFAULT_FROM;
  const fallbackFrom = process.env.GMAIL_USER
    ? `"Advanced Automations Support" <${process.env.GMAIL_USER}>`
    : preferredFrom;

  try {
    try {
      await transporter.sendMail({ from: preferredFrom, to, subject, html });
    } catch (primaryError) {
      // Common when the Send mail as alias is missing/misconfigured in Gmail.
      if (fallbackFrom !== preferredFrom) {
        console.warn(
          "Primary From failed, retrying with GMAIL_USER:",
          primaryError && primaryError.message ? primaryError.message : primaryError
        );
        await transporter.sendMail({ from: fallbackFrom, to, subject, html });
      } else {
        throw primaryError;
      }
    }
    return { sent: true };
  } finally {
    try {
      transporter.close();
    } catch {
      // ignore
    }
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusLabel(status) {
  const map = {
    open: "Open",
    in_progress: "In progress",
    waiting_on_customer: "Waiting for customer",
    done: "Resolved",
  };
  return map[status] || String(status || "").replace(/_/g, " ");
}

function emailLayout({ preheader, title, introHtml, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const safePreheader = escapeHtml(preheader || "");
  const safeTitle = escapeHtml(title || "");
  const safeCtaLabel = escapeHtml(ctaLabel || "View ticket");
  const safeCtaUrl = escapeHtml(ctaUrl || "#");
  const safeFooter = escapeHtml(
    footerNote || "This message was sent by Advanced Automations Support. Replies to this email address are not monitored — please use your ticket link."
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#eef3f8;color:#07111f;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe5f0;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#08111f 0%,#12304f 100%);padding:22px 28px;">
              <div style="color:#19c7d4;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Advanced Automations</div>
              <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;margin-top:6px;">Support</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;letter-spacing:-0.02em;color:#07111f;">${safeTitle}</h1>
              <div style="color:#334155;font-size:15px;line-height:1.6;">${introHtml || ""}</div>
              ${bodyHtml || ""}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 8px;">
                <tr>
                  <td style="border-radius:10px;background:#08111f;">
                    <a href="${safeCtaUrl}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${safeCtaLabel}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;color:#667085;font-size:12px;line-height:1.5;word-break:break-all;">
                Or open this link:<br />
                <a href="${safeCtaUrl}" style="color:#2477ff;text-decoration:none;">${safeCtaUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #dbe5f0;padding:16px 28px;">
              <p style="margin:0;color:#667085;font-size:12px;line-height:1.5;">${safeFooter}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label, value) {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:8px 0;color:#667085;font-size:13px;width:120px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#07111f;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

function messageCard(label, body) {
  if (!body) return "";
  return `
    <div style="margin-top:18px;background:#f8fafc;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px;">
      <div style="color:#667085;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(label)}</div>
      <div style="color:#172335;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</div>
    </div>`;
}

async function notifyTicketCreated({ ticket, trackUrl, adminEmail }) {
  const firstMessage =
    (ticket.messages && ticket.messages[0] && ticket.messages[0].body) || "";

  const adminHtml = emailLayout({
    preheader: `New ticket from ${ticket.clientName || ticket.clientSlug}: ${ticket.subject}`,
    title: "New support ticket",
    introHtml: `<p style="margin:0 0 14px;">A client submitted a new request.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        ${detailRow("Client", ticket.clientName || ticket.clientSlug)}
        ${detailRow("From", `${ticket.requesterName || "—"} <${ticket.requesterEmail || ""}>`)}
        ${detailRow("Subject", ticket.subject)}
      </table>
      ${messageCard("Message", firstMessage)}`,
    ctaLabel: "Open admin",
    ctaUrl: trackUrl.replace(/\/t\/.*/, "/admin/"),
    footerNote: "Internal notification for Advanced Automations Support.",
  });

  const jobs = [
    sendMail({
      to: adminEmail,
      subject: `[Support] New ticket: ${ticket.subject}`,
      html: adminHtml,
    }),
  ];

  if (ticket.requesterEmail) {
    const customerHtml = emailLayout({
      preheader: `We received your request: ${ticket.subject}`,
      title: "We received your request",
      introHtml: `<p style="margin:0 0 14px;">Hi ${escapeHtml(ticket.requesterName || "there")},</p>
        <p style="margin:0 0 14px;">Thanks for reaching out. Your support request is in our queue and we’ll follow up here.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Subject", ticket.subject)}
          ${detailRow("Status", statusLabel(ticket.status))}
        </table>`,
      ctaLabel: "Track your ticket",
      ctaUrl: trackUrl,
    });
    jobs.push(
      sendMail({
        to: ticket.requesterEmail,
        subject: `We received your request: ${ticket.subject}`,
        html: customerHtml,
      })
    );
  }

  await Promise.allSettled(jobs);
}

async function notifyTicketUpdate({ ticket, trackUrl, kind, body }) {
  if (!ticket.requesterEmail) return;

  let title = "Your ticket was updated";
  let subject = `[Support] Ticket updated: ${ticket.subject}`;
  let intro =
    "There’s a new update on your support ticket. You can review it and reply using the link below.";
  let messageLabel = "Update";

  if (kind === "reply") {
    title = "New reply on your ticket";
    subject = `[Support] New reply: ${ticket.subject}`;
    intro =
      "Our team replied to your support request. Open the ticket to continue the conversation.";
    messageLabel = "Reply";
  } else if (kind === "done") {
    title = "Your ticket was resolved";
    subject = `[Support] Resolved: ${ticket.subject}`;
    intro =
      "We’ve marked this ticket as resolved. If you still need help, reply on the ticket and we’ll reopen it.";
  } else if (kind === "status") {
    title = "Ticket status updated";
    subject = `[Support] Status update: ${ticket.subject}`;
    intro = `Your ticket status is now <strong>${escapeHtml(statusLabel(ticket.status))}</strong>.`;
  }

  const html = emailLayout({
    preheader: `${title}: ${ticket.subject}`,
    title,
    introHtml: `<p style="margin:0 0 14px;">Hi ${escapeHtml(ticket.requesterName || "there")},</p>
      <p style="margin:0 0 14px;">${intro}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        ${detailRow("Subject", ticket.subject)}
        ${detailRow("Status", statusLabel(ticket.status))}
      </table>
      ${messageCard(messageLabel, body)}`,
    ctaLabel: "View ticket",
    ctaUrl: trackUrl,
  });

  await sendMail({
    to: ticket.requesterEmail,
    subject,
    html,
  });
}

module.exports = {
  sendMail,
  notifyTicketCreated,
  notifyTicketUpdate,
  escapeHtml,
};
