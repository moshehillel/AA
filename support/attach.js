// Shared ticket attachment helpers for support / track / admin pages.
(function (global) {
  const MAX_FILES = 3;
  const MAX_BYTES = 3 * 1024 * 1024;
  const ALLOWED = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
  ]);

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function readFileAsAttachment(file) {
    return new Promise((resolve, reject) => {
      const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
      if (!ALLOWED.has(type)) {
        reject(new Error(`${file.name}: use PNG, JPG, WEBP, GIF, PDF, or TXT.`));
        return;
      }
      if (file.size > MAX_BYTES) {
        reject(new Error(`${file.name} is too large (max 3MB).`));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve({
          filename: file.name,
          contentType: type || "application/octet-stream",
          data: base64,
        });
      };
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function filesFromInput(input) {
    const list = Array.from((input && input.files) || []);
    if (!list.length) return [];
    if (list.length > MAX_FILES) {
      throw new Error(`You can attach up to ${MAX_FILES} files.`);
    }
    const out = [];
    for (const file of list) {
      out.push(await readFileAsAttachment(file));
    }
    return out;
  }

  function attachmentUrl(ticket, attachment, { download = false } = {}) {
    const params = new URLSearchParams({
      attachmentId: attachment.id,
    });
    if (ticket.trackToken) params.set("trackToken", ticket.trackToken);
    else if (ticket.id) params.set("id", ticket.id);
    if (download) params.set("download", "1");
    return `/.netlify/functions/tickets-attachment?${params.toString()}`;
  }

  function renderAttachmentsHtml(ticket, message) {
    const attachments = (message && message.attachments) || [];
    if (!attachments.length) return "";
    const items = attachments
      .map((att) => {
        const url = attachmentUrl(ticket, att);
        const isImage = String(att.contentType || "").startsWith("image/");
        const label = `${escapeHtml(att.filename)} · ${formatSize(att.size || 0)}`;
        if (isImage) {
          return `
            <a class="attach-card" href="${escapeHtml(url)}" target="_blank" rel="noopener">
              <img src="${escapeHtml(url)}" alt="${escapeHtml(att.filename)}" loading="lazy" />
              <span>${label}</span>
            </a>`;
        }
        const downloadUrl = attachmentUrl(ticket, att, { download: true });
        return `
          <a class="attach-file" href="${escapeHtml(downloadUrl)}" target="_blank" rel="noopener">
            📎 ${label}
          </a>`;
      })
      .join("");
    return `<div class="attach-list">${items}</div>`;
  }

  global.TicketAttachments = {
    MAX_FILES,
    MAX_BYTES,
    filesFromInput,
    attachmentUrl,
    renderAttachmentsHtml,
    formatSize,
  };
})(window);
