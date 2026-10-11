const { randomToken } = require("./passwords");

const ATTACH_STORE = "support-attachments";
const MAX_FILES = 3;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB each (keeps JSON+base64 under Netlify body limits)
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

function normalizeContentType(type) {
  const t = String(type || "").toLowerCase().trim();
  if (t === "image/jpg") return "image/jpeg";
  return t;
}

function sanitizeFilename(name) {
  const base = String(name || "file")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return base || "file";
}

/**
 * Parse attachments from request body.
 * Expected shape: [{ filename, contentType, data }] where data is base64 (optionally data-URL).
 */
function parseIncomingAttachments(raw) {
  if (!raw) return { ok: true, files: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Attachments must be an array." };
  }
  if (raw.length > MAX_FILES) {
    return { ok: false, error: `You can attach up to ${MAX_FILES} files.` };
  }

  const files = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid attachment." };
    }
    const filename = sanitizeFilename(item.filename);
    const contentType = normalizeContentType(item.contentType);
    if (!ALLOWED_TYPES.has(contentType)) {
      return {
        ok: false,
        error: `Unsupported file type for ${filename}. Use PNG, JPG, WEBP, GIF, PDF, or TXT.`,
      };
    }

    let data = String(item.data || "");
    const dataUrlMatch = data.match(/^data:[^;]+;base64,(.+)$/i);
    if (dataUrlMatch) data = dataUrlMatch[1];
    data = data.replace(/\s/g, "");
    if (!data) {
      return { ok: false, error: `Empty file: ${filename}` };
    }

    let buffer;
    try {
      buffer = Buffer.from(data, "base64");
    } catch {
      return { ok: false, error: `Could not read file: ${filename}` };
    }
    if (!buffer.length) {
      return { ok: false, error: `Empty file: ${filename}` };
    }
    if (buffer.length > MAX_BYTES) {
      return {
        ok: false,
        error: `${filename} is too large. Max ${Math.round(MAX_BYTES / (1024 * 1024))}MB per file.`,
      };
    }

    files.push({
      id: randomToken(10),
      filename,
      contentType,
      size: buffer.length,
      buffer,
    });
  }

  return { ok: true, files };
}

function publicAttachmentMeta(file) {
  return {
    id: file.id,
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
  };
}

module.exports = {
  ATTACH_STORE,
  MAX_FILES,
  MAX_BYTES,
  ALLOWED_TYPES,
  parseIncomingAttachments,
  publicAttachmentMeta,
};
