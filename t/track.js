const API = "/.netlify/functions";

function tokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "t" && parts[1]) return decodeURIComponent(parts[1]);
  return new URLSearchParams(window.location.search).get("token");
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
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusLabel(status) {
  const map = {
    open: "Open",
    in_progress: "In Progress",
    waiting_on_customer: "Waiting for Customer",
    done: "Resolved",
  };
  return map[status] || String(status || "").replace(/_/g, " ");
}

function displayTicketId(ticket) {
  const raw = String(ticket.id || "").replace(/[^a-zA-Z0-9]/g, "");
  return `#${raw.slice(0, 6).toUpperCase()}`;
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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const panel = document.getElementById("trackPanel");
const trackToken = tokenFromPath();

function render(ticket) {
  const messages = (ticket.messages || [])
    .map(
      (m) => `
      <div class="bubble ${m.author === "admin" ? "admin" : "client"}">
        <div class="who">${m.author === "admin" ? "Advanced Automations" : "You"} · ${formatWhen(m.createdAt)}</div>
        <div class="body">${escapeHtml(m.body)}</div>
      </div>`
    )
    .join("");

  panel.innerHTML = `
    <div class="track-hero">
      <span class="badge ${ticket.status}">${statusLabel(ticket.status)}</span>
      <h1>${escapeHtml(ticket.subject)}</h1>
      <p class="track-meta">${displayTicketId(ticket)} · ${escapeHtml(ticket.clientName || ticket.clientSlug)} · Updated ${formatWhen(ticket.updatedAt)}</p>
    </div>
    <div class="thread">${messages || '<p class="status">No messages yet.</p>'}</div>
    <div class="reply-box">
      <form id="replyForm">
        <div class="field">
          <label for="replyBody">Add a reply</label>
          <textarea id="replyBody" required placeholder="Ask a follow-up or share more detail…"></textarea>
        </div>
        <button class="btn btn-primary" type="submit">Send reply</button>
      </form>
      <p class="status" id="replyStatus"></p>
    </div>
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
    panel.innerHTML = `<p class="status error" style="padding:1.5rem;">Missing track token in the URL.</p>`;
    return;
  }
  try {
    const data = await api(`tickets-get?trackToken=${encodeURIComponent(trackToken)}`);
    document.title = `${data.ticket.subject} · Track ticket`;
    render(data.ticket);
  } catch (error) {
    panel.innerHTML = `<p class="status error" style="padding:1.5rem;">${escapeHtml(error.message)}</p>`;
  }
}

load();
