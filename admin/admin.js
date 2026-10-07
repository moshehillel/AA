const API = "/.netlify/functions";

const state = {
  tab: "tickets",
  tickets: [],
  clients: [],
  selectedId: null,
  statusFilter: "all",
};

const els = {
  loginView: document.getElementById("loginView"),
  appView: document.getElementById("appView"),
  adminLoginForm: document.getElementById("adminLoginForm"),
  loginStatus: document.getElementById("loginStatus"),
  globalStatus: document.getElementById("globalStatus"),
  ticketList: document.getElementById("ticketList"),
  ticketDetail: document.getElementById("ticketDetail"),
  statusFilter: document.getElementById("statusFilter"),
  ticketsTab: document.getElementById("ticketsTab"),
  clientsTab: document.getElementById("clientsTab"),
  clientList: document.getElementById("clientList"),
  addClientForm: document.getElementById("addClientForm"),
  clientName: document.getElementById("clientName"),
  clientSlug: document.getElementById("clientSlug"),
  clientFormStatus: document.getElementById("clientFormStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
};

function setStatus(el, message, type = "") {
  el.textContent = message || "";
  el.className = `status ${type}`.trim();
}

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
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

function statusBadge(status) {
  return `<span class="badge ${status}">${statusLabel(status)}</span>`;
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

function renderTicketList() {
  if (!state.tickets.length) {
    els.ticketList.innerHTML = `<p class="muted">No tickets yet.</p>`;
    return;
  }
  els.ticketList.innerHTML = state.tickets
    .map((t) => {
      const active = t.id === state.selectedId ? "active" : "";
      return `
        <button class="item ${active}" type="button" data-id="${t.id}">
          <div class="detail-head">
            <h3>${escapeHtml(t.subject)}</h3>
            ${statusBadge(t.status)}
          </div>
          <div class="meta">${escapeHtml(t.clientName || t.clientSlug)} · ${escapeHtml(t.requesterName)} · ${formatWhen(t.updatedAt)}</div>
        </button>
      `;
    })
    .join("");
}

function selectedTicket() {
  return state.tickets.find((t) => t.id === state.selectedId) || null;
}

function renderTicketDetail() {
  const t = selectedTicket();
  if (!t) {
    els.ticketDetail.innerHTML = `<p class="muted">Select a ticket to reply or update status.</p>`;
    return;
  }

  const messages = (t.messages || [])
    .map(
      (m) => `
      <div class="bubble ${m.author}">
        <div class="who">${m.author === "admin" ? "You" : "Client"} · ${formatWhen(m.createdAt)}</div>
        <div>${escapeHtml(m.body)}</div>
      </div>`
    )
    .join("");

  els.ticketDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2 style="font-size:1.1rem;margin-bottom:0.35rem;">${escapeHtml(t.subject)}</h2>
        <div class="meta">${escapeHtml(t.clientName || t.clientSlug)} · ${escapeHtml(t.requesterName)} &lt;${escapeHtml(t.requesterEmail)}&gt;</div>
      </div>
      ${statusBadge(t.status)}
    </div>
    <p class="meta" style="margin:0.75rem 0;">Track: <a href="/t/${encodeURIComponent(t.trackToken)}/" target="_blank" rel="noopener">/t/${escapeHtml(t.trackToken)}/</a></p>
    <div class="actions" style="margin-bottom:1rem;">
      <button class="btn" type="button" data-status="open">Open</button>
      <button class="btn" type="button" data-status="in_progress">In progress</button>
      <button class="btn" type="button" data-status="waiting_on_customer">Waiting for customer</button>
      <button class="btn primary" type="button" data-status="done">Mark resolved</button>
    </div>
    <div class="thread">${messages}</div>
    <form id="replyForm">
      <div class="field">
        <label for="replyBody">Reply</label>
        <textarea id="replyBody" required placeholder="Write a reply..."></textarea>
      </div>
      <button class="btn primary" type="submit">Send reply</button>
    </form>
    <p class="status" id="detailStatus"></p>
  `;

  els.ticketDetail.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const detailStatus = document.getElementById("detailStatus");
      try {
        setStatus(detailStatus, "Updating…");
        const data = await api("tickets-status", {
          method: "POST",
          body: JSON.stringify({ id: t.id, status: btn.dataset.status }),
        });
        upsertTicket(data.ticket);
        renderTicketList();
        renderTicketDetail();
        setStatus(els.globalStatus, "Status updated.", "ok");
      } catch (error) {
        setStatus(detailStatus, error.message, "error");
      }
    });
  });

  const replyForm = document.getElementById("replyForm");
  replyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const detailStatus = document.getElementById("detailStatus");
    const body = document.getElementById("replyBody").value.trim();
    try {
      setStatus(detailStatus, "Sending…");
      const data = await api("tickets-reply", {
        method: "POST",
        body: JSON.stringify({ id: t.id, message: body }),
      });
      upsertTicket(data.ticket);
      renderTicketList();
      renderTicketDetail();
      setStatus(els.globalStatus, "Reply sent.", "ok");
    } catch (error) {
      setStatus(detailStatus, error.message, "error");
    }
  });
}

function upsertTicket(ticket) {
  const idx = state.tickets.findIndex((t) => t.id === ticket.id);
  if (idx >= 0) state.tickets[idx] = ticket;
  else state.tickets.unshift(ticket);
  state.tickets.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function renderClients() {
  if (!state.clients.length) {
    els.clientList.innerHTML = `<p class="muted">No clients yet. Add one on the left.</p>`;
    return;
  }

  els.clientList.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Name</th><th>Slug</th><th>Default contact</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${state.clients
          .map(
            (c) => `
          <tr>
            <td>${escapeHtml(c.name)}</td>
            <td><code>${escapeHtml(c.slug)}</code></td>
            <td class="meta">${escapeHtml(c.defaultName || "—")}<br>${escapeHtml(c.defaultEmail || "—")}</td>
            <td>${c.active ? '<span class="badge open">active</span>' : '<span class="badge inactive">disabled</span>'}</td>
            <td class="actions">
              <button class="btn" type="button" data-action="defaults" data-slug="${escapeHtml(c.slug)}">Edit defaults</button>
              <button class="btn" type="button" data-action="toggle" data-slug="${escapeHtml(c.slug)}" data-active="${c.active ? "1" : "0"}">${c.active ? "Disable" : "Enable"}</button>
              <button class="btn" type="button" data-action="reset" data-slug="${escapeHtml(c.slug)}">Reset password</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  els.clientList.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.slug;
      const client = state.clients.find((c) => c.slug === slug);
      try {
        if (btn.dataset.action === "toggle") {
          const active = btn.dataset.active !== "1";
          await api("admin-clients", {
            method: "PATCH",
            body: JSON.stringify({ slug, active }),
          });
          setStatus(els.globalStatus, active ? "Client enabled." : "Client disabled.", "ok");
        } else if (btn.dataset.action === "defaults") {
          const defaultName = prompt(
            `Default contact name for ${slug}`,
            (client && client.defaultName) || ""
          );
          if (defaultName === null) return;
          const defaultEmail = prompt(
            `Default contact email for ${slug}`,
            (client && client.defaultEmail) || ""
          );
          if (defaultEmail === null) return;
          await api("admin-clients", {
            method: "PATCH",
            body: JSON.stringify({ slug, defaultName, defaultEmail }),
          });
          setStatus(els.globalStatus, "Default contact updated.", "ok");
        } else {
          const password = prompt(`New password for ${slug}`);
          if (!password) return;
          await api("admin-clients", {
            method: "PATCH",
            body: JSON.stringify({ slug, password }),
          });
          setStatus(els.globalStatus, "Password updated.", "ok");
        }
        await loadClients();
      } catch (error) {
        setStatus(els.globalStatus, error.message, "error");
      }
    });
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadTickets() {
  const data = await api(`tickets-list?status=${encodeURIComponent(state.statusFilter)}`);
  state.tickets = data.tickets || [];
  if (state.selectedId && !state.tickets.find((t) => t.id === state.selectedId)) {
    state.selectedId = null;
  }
  renderTicketList();
  renderTicketDetail();
}

async function loadClients() {
  const data = await api("admin-clients");
  state.clients = data.clients || [];
  renderClients();
}

function showLoggedIn() {
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
}

function showLoggedOut() {
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
}

async function refresh() {
  try {
    setStatus(els.globalStatus, "Loading…");
    if (state.tab === "tickets") await loadTickets();
    else await loadClients();
    setStatus(els.globalStatus, "");
  } catch (error) {
    if (error.status === 401) {
      showLoggedOut();
      setStatus(els.loginStatus, "Please sign in.", "error");
      return;
    }
    setStatus(els.globalStatus, error.message, "error");
  }
}

async function bootstrap() {
  try {
    const me = await api("admin-me");
    if (me.authenticated) {
      showLoggedIn();
      await refresh();
    } else {
      showLoggedOut();
    }
  } catch (error) {
    showLoggedOut();
    if (error.status && error.status !== 401) {
      setStatus(els.loginStatus, error.message, "error");
    }
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.tab = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    els.ticketsTab.classList.toggle("hidden", state.tab !== "tickets");
    els.clientsTab.classList.toggle("hidden", state.tab !== "clients");
    refresh();
  });
});

els.statusFilter.addEventListener("change", () => {
  state.statusFilter = els.statusFilter.value;
  refresh();
});

els.ticketList.addEventListener("click", (e) => {
  const item = e.target.closest("[data-id]");
  if (!item) return;
  state.selectedId = item.dataset.id;
  renderTicketList();
  renderTicketDetail();
});

els.clientName.addEventListener("input", () => {
  if (!els.clientSlug.dataset.touched) {
    els.clientSlug.value = slugify(els.clientName.value);
  }
});

els.clientSlug.addEventListener("input", () => {
  els.clientSlug.dataset.touched = "1";
});

els.addClientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = els.clientName.value.trim();
  const slug = slugify(els.clientSlug.value.trim());
  const password = document.getElementById("clientPassword").value;
  const defaultName = document.getElementById("clientDefaultName").value.trim();
  const defaultEmail = document.getElementById("clientDefaultEmail").value.trim();
  try {
    setStatus(els.clientFormStatus, "Saving…");
    await api("admin-clients", {
      method: "POST",
      body: JSON.stringify({ name, slug, password, defaultName, defaultEmail }),
    });
    els.addClientForm.reset();
    delete els.clientSlug.dataset.touched;
    setStatus(els.clientFormStatus, `Added. Login at /support/ with slug “${slug}”.`, "ok");
    await loadClients();
  } catch (error) {
    setStatus(els.clientFormStatus, error.message, "error");
  }
});

els.refreshBtn.addEventListener("click", refresh);

els.adminLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("adminPassword").value;
  try {
    setStatus(els.loginStatus, "Signing in…");
    await api("admin-login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    document.getElementById("adminPassword").value = "";
    setStatus(els.loginStatus, "");
    showLoggedIn();
    await refresh();
  } catch (error) {
    setStatus(els.loginStatus, error.message, "error");
  }
});

els.logoutBtn.addEventListener("click", async () => {
  try {
    await api("admin-logout", { method: "POST", body: "{}" });
  } catch {
    // ignore
  }
  showLoggedOut();
});

bootstrap();
