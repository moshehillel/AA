const API = "/.netlify/functions";

const els = {
  loginView: document.getElementById("loginView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  loginStatus: document.getElementById("loginStatus"),
  logoutBtn: document.getElementById("logoutBtn"),
  createForm: document.getElementById("createForm"),
  createStatus: document.getElementById("createStatus"),
  ticketList: document.getElementById("ticketList"),
  ticketFilters: document.getElementById("ticketFilters"),
  welcomeTitle: document.getElementById("welcomeTitle"),
  welcomeCopy: document.getElementById("welcomeCopy"),
  newTicketBtn: document.getElementById("newTicketBtn"),
  ticketModal: document.getElementById("ticketModal"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  statOpen: document.getElementById("statOpen"),
  statProgress: document.getElementById("statProgress"),
  statResolved: document.getElementById("statResolved"),
};

const state = {
  client: null,
  tickets: [],
  filter: "all",
};

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
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function trackUrlFor(ticket) {
  return `${window.location.origin}/t/${encodeURIComponent(ticket.trackToken)}/`;
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
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function applyContactPlaceholders(client) {
  const nameInput = document.getElementById("requesterName");
  const emailInput = document.getElementById("requesterEmail");
  if (!nameInput || !emailInput) return;
  const defaultName = (client && client.defaultName) || (client && client.name) || "";
  const defaultEmail = (client && client.defaultEmail) || "";
  nameInput.placeholder = defaultName
    ? `Falls back to ${defaultName}`
    : "Falls back to account default";
  emailInput.placeholder = defaultEmail
    ? `Falls back to ${defaultEmail}`
    : "Falls back to account default";
}

function openModal() {
  els.ticketModal.classList.remove("hidden");
  els.createStatus.innerHTML = "";
  document.getElementById("subject")?.focus();
  document.body.style.overflow = "hidden";
}

function closeModal() {
  els.ticketModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function showLoggedIn(client) {
  state.client = client || null;
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  const name = (client && (client.defaultName || client.name)) || "there";
  els.welcomeTitle.textContent = `Welcome back, ${name}`;
  els.welcomeCopy.textContent = "How can we help you today?";
  applyContactPlaceholders(client);
}

function showLoggedOut() {
  state.client = null;
  state.tickets = [];
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  closeModal();
  applyContactPlaceholders(null);
}

function updateSummary() {
  const open = state.tickets.filter((t) => t.status === "open").length;
  const progress = state.tickets.filter(
    (t) => t.status === "in_progress" || t.status === "waiting_on_customer"
  ).length;
  const resolved = state.tickets.filter((t) => t.status === "done").length;
  els.statOpen.textContent = String(open);
  els.statProgress.textContent = String(progress);
  els.statResolved.textContent = String(resolved);
}

function filteredTickets() {
  if (state.filter === "all") return state.tickets;
  return state.tickets.filter((t) => t.status === state.filter);
}

function renderTickets() {
  updateSummary();
  const tickets = filteredTickets();

  if (!state.tickets.length) {
    els.ticketList.innerHTML = `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">◎</div>
        <strong>No tickets yet</strong>
        <p>When you need help, create a ticket and track every update in one place.</p>
        <button class="btn btn-primary" type="button" id="emptyNewTicket">+ Create your first ticket</button>
      </div>`;
    document.getElementById("emptyNewTicket")?.addEventListener("click", openModal);
    return;
  }

  if (!tickets.length) {
    els.ticketList.innerHTML = `
      <div class="empty">
        <strong>No tickets in this filter</strong>
        <p>Try another status above, or create a new ticket.</p>
      </div>`;
    return;
  }

  els.ticketList.innerHTML = tickets
    .map((t) => {
      const url = trackUrlFor(t);
      return `
        <button class="ticket-row" type="button" data-href="${escapeHtml(url)}">
          <span class="ticket-id">${displayTicketId(t)}</span>
          <span class="ticket-main">
            <span class="ticket-subject">${escapeHtml(t.subject)}</span>
            <span class="ticket-sub">Created ${formatWhen(t.createdAt)}</span>
          </span>
          <span class="badge ${t.status}">${statusLabel(t.status)}</span>
          <span class="ticket-updated">Updated ${formatWhen(t.updatedAt)}</span>
          <span class="ticket-chevron" aria-hidden="true">›</span>
        </button>`;
    })
    .join("");

  els.ticketList.querySelectorAll(".ticket-row").forEach((row) => {
    row.addEventListener("click", () => {
      window.open(row.dataset.href, "_blank", "noopener");
    });
  });
}

async function loadTickets() {
  const data = await api("tickets-list");
  state.tickets = data.tickets || [];
  renderTickets();
}

async function bootstrap() {
  try {
    const me = await api("support-me");
    if (me.authenticated) {
      showLoggedIn(me.client);
      await loadTickets();
    } else {
      showLoggedOut();
    }
  } catch {
    showLoggedOut();
  }
}

els.ticketFilters.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-filter]");
  if (!chip) return;
  state.filter = chip.dataset.filter;
  els.ticketFilters.querySelectorAll(".filter-chip").forEach((c) => {
    c.classList.toggle("active", c === chip);
  });
  renderTickets();
});

els.newTicketBtn.addEventListener("click", openModal);
els.closeModalBtn.addEventListener("click", closeModal);

els.ticketModal.addEventListener("click", (e) => {
  if (e.target === els.ticketModal) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.ticketModal.classList.contains("hidden")) {
    closeModal();
  }
});

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const slug = document.getElementById("loginSlug").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  try {
    els.loginStatus.textContent = "Signing in…";
    els.loginStatus.className = "status";
    const data = await api("support-login", {
      method: "POST",
      body: JSON.stringify({ slug, password }),
    });
    els.loginStatus.textContent = "";
    showLoggedIn(data.client);
    await loadTickets();
  } catch (error) {
    els.loginStatus.textContent = error.message;
    els.loginStatus.className = "status error";
  }
});

els.logoutBtn.addEventListener("click", async () => {
  try {
    await api("support-logout", { method: "POST", body: "{}" });
  } catch {
    // ignore
  }
  showLoggedOut();
});

els.createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    requesterName: document.getElementById("requesterName").value.trim(),
    requesterEmail: document.getElementById("requesterEmail").value.trim(),
    subject: document.getElementById("subject").value.trim(),
    message: document.getElementById("message").value.trim(),
  };
  try {
    els.createStatus.innerHTML = `<p class="status">Submitting…</p>`;
    const data = await api("tickets-create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    els.createForm.reset();
    applyContactPlaceholders(state.client);
    els.createStatus.innerHTML = `
      <div class="success-box">
        <strong>Ticket submitted</strong>
        <div class="meta">We’ll follow up on your track link.</div>
        <div class="actions">
          <a class="btn btn-primary btn-sm" href="${escapeHtml(data.trackUrl)}" target="_blank" rel="noopener">Open track link</a>
          <button class="btn btn-ghost btn-sm" type="button" id="copyNewTrack">Copy link</button>
          <button class="btn btn-ghost btn-sm" type="button" id="doneModal">Done</button>
        </div>
      </div>`;
    document.getElementById("copyNewTrack")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(data.trackUrl);
        document.getElementById("copyNewTrack").textContent = "Copied";
      } catch {
        prompt("Copy this track link:", data.trackUrl);
      }
    });
    document.getElementById("doneModal")?.addEventListener("click", () => {
      closeModal();
      els.createStatus.innerHTML = "";
    });
    await loadTickets();
  } catch (error) {
    els.createStatus.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
});

bootstrap();
