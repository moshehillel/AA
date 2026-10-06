const API = "/.netlify/functions";

function tokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  // /t/<token>/...
  if (parts[0] === "t" && parts[1]) return decodeURIComponent(parts[1]);
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${API}/${path}`, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

const panel = document.getElementById("trackPanel");
const trackToken = tokenFromPath();

function render(ticket) {
  const messages = (ticket.messages || [])
    .map(
      (m) => `
      <div class="bubble ${m.author}">
        <div class="who">${m.author === "admin" ? "Advanced Automations" : "You"} · ${formatWhen(m.createdAt)}</div>
        <div>${escapeHtml(m.body)}</div>
      </div>`
    )
    .join("");

  panel.innerHTML = `
    <div class="track-hero">
      <span class="badge ${ticket.status}">${ticket.status.replace("_", " ")}</span>
      <h1>${escapeHtml(ticket.subject)}</h1>
      <p class="meta">${escapeHtml(ticket.clientName || ticket.clientSlug)} · updated ${formatWhen(ticket.updatedAt)}</p>
    </div>
    <div class="thread">${messages}</div>
    <form id="replyForm">
      <div class="field">
        <label for="replyBody">Add a reply</label>
        <textarea id="replyBody" required placeholder="Ask a follow-up or share more detail..."></textarea>
      </div>
      <button type="submit">Send reply</button>
    </form>
    <p class="status" id="replyStatus"></p>
  `;

  document.getElementById("replyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("replyStatus");
    const message = document.getElementById("replyBody").value.trim();
    try {
      status.textContent = "Sending…";
      status.className = "status";
      const data = await api("tickets-reply", {
        method: "POST",
        body: JSON.stringify({ trackToken, message }),
      });
      render(data.ticket);
      const next = document.getElementById("replyStatus");
      if (next) {
        next.textContent = "Reply sent.";
        next.className = "status ok";
      }
    } catch (error) {
      status.textContent = error.message;
      status.className = "status error";
    }
  });
}

async function load() {
  if (!trackToken) {
    panel.innerHTML = `<p class="status error">Missing track token in the URL.</p>`;
    return;
  }
  try {
    const data = await api(`tickets-get?trackToken=${encodeURIComponent(trackToken)}`);
    render(data.ticket);
  } catch (error) {
    panel.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

load();
