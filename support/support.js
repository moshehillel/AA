const API = "/.netlify/functions";

const els = {
  loginView: document.getElementById("loginView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  loginStatus: document.getElementById("loginStatus"),
  logoutBtn: document.getElementById("logoutBtn"),
  subtitle: document.getElementById("subtitle"),
  createForm: document.getElementById("createForm"),
  createStatus: document.getElementById("createStatus"),
  ticketList: document.getElementById("ticketList"),
  ticketCount: document.getElementById("ticketCount"),
  ticketFilters: document.getElementById("ticketFilters"),
  welcomeTitle: document.getElementById("welcomeTitle"),
  welcomeCopy: document.getElementById("welcomeCopy"),
};

const state = {
  client: null,
  tickets: [],
  filter: "all",
};

function setStatus(el, message, type = "") {
  if (!el) return;
  if (type === "ok" && message) {
    el.innerHTML = `<div class="success-banner"><strong>Request submitted</strong><span class="meta">${escapeHtml(message)}</span></div>`;
    return;
  }
  el.textContent = message || "";
  el.className = `status ${type}`.trim();
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
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function statusLabel(status) {
  return String(status || "").replace(/_/g, " ");
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
    ? `Optional — falls back to ${defaultName}`
    : "Optional — falls back to account default";
  emailInput.placeholder = defaultEmail
    ? `Optional — falls back to ${defaultEmail}`
    : "Optional — falls back to account default";
}

function showLoggedIn(client) {
  state.client = client || null;
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  els.logoutBtn.classList.remove("hidden");
  const name = client ? client.name : "your account";
  els.subtitle.textContent = `${name} · signed in`;
  els.welcomeTitle.textContent = `Welcome back, ${name}`;
  els.welcomeCopy.textContent = "Submit a new request or open a track link to follow an existing ticket.";
  applyContactPlaceholders(client);
}

function showLoggedOut() {
  state.client = null;
  state.tickets = [];
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
  els.subtitle.textContent = "Sign in to submit and track requests";
  applyContactPlaceholders(null);
}

function filteredTickets() {
  if (state.filter === "all") return state.tickets;
  return state.tickets.filter((t) => t.status === state.filter);
}

function renderTickets() {
  const tickets = filteredTickets();
  const total = state.tickets.length;
  els.ticketCount.textContent = total ? `${tickets.length} shown · ${total} total` : "";

  if (!total) {
    els.ticketList.innerHTML = `
      <div class="empty">
        <strong>No tickets yet</strong>
        <span>Submit a request on the left to get your first track link.</span>
      </div>`;
    return;
  }

  if (!tickets.length) {
    els.ticketList.innerHTML = `
      <div class="empty">
        <strong>Nothing in this filter</strong>
        <span>Try another status above.</span>
      </div>`;
    return;
  }

  els.ticketList.innerHTML = tickets
    .map((t) => {
      const trackUrl = `${window.location.origin}/t/${encodeURIComponent(t.trackToken)}/`;
      return `
        <article class="item">
          <div class="item-top">
            <h3>${escapeHtml(t.subject)}</h3>
            <span class="badge ${t.status}">${statusLabel(t.status)}</span>
          </div>
          <div class="meta">Updated ${formatWhen(t.updatedAt)}</div>
          <div class="actions">
            <a class="btn ghost sm" href="${trackUrl}" target="_blank" rel="noopener">Open track link</a>
            <button class="btn ghost sm" type="button" data-copy="${trackUrl}">Copy link</button>
          </div>
        </article>
      `;
    })
    .join("");

  els.ticketList.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        const prev = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      } catch {
        prompt("Copy this track link:", btn.dataset.copy);
      }
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

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const slug = document.getElementById("loginSlug").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  try {
    setStatus(els.loginStatus, "Signing in…");
    const data = await api("support-login", {
      method: "POST",
      body: JSON.stringify({ slug, password }),
    });
    setStatus(els.loginStatus, "");
    showLoggedIn(data.client);
    await loadTickets();
  } catch (error) {
    setStatus(els.loginStatus, error.message, "error");
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
    els.createStatus.textContent = "Submitting…";
    els.createStatus.className = "status";
    const data = await api("tickets-create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    els.createForm.reset();
    applyContactPlaceholders(state.client);
    els.createStatus.innerHTML = `
      <div class="success-banner">
        <strong>Request submitted</strong>
        <span class="meta">We emailed you a track link. You can also copy it below.</span>
        <div class="actions">
          <a class="btn sm" href="${escapeHtml(data.trackUrl)}" target="_blank" rel="noopener">Open track link</a>
          <button class="btn ghost sm" type="button" id="copyNewTrack">Copy link</button>
        </div>
      </div>`;
    const copyBtn = document.getElementById("copyNewTrack");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(data.trackUrl);
          copyBtn.textContent = "Copied";
        } catch {
          prompt("Copy this track link:", data.trackUrl);
        }
      });
    }
    await loadTickets();
  } catch (error) {
    setStatus(els.createStatus, error.message, "error");
  }
});

bootstrap();
