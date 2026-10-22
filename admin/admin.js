const API = "/.netlify/functions";

const state = {
  tab: "tickets",
  tickets: [],
  clients: [],
  selectedId: null,
  // Full ticket currently open in the detail pane (keeps replies even if list filters change).
  selectedTicket: null,
  // Default: hide resolved tickets until "View resolved" is clicked.
  statusFilter: "active",
  statusUpdatingId: null,
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
  viewResolvedBtn: document.getElementById("viewResolvedBtn"),
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

function ticketMatchesFilter(ticket, filter) {
  if (!ticket) return false;
  if (filter === "all") return true;
  if (filter === "active") return ticket.status !== "done";
  if (filter === "done") return ticket.status === "done";
  return ticket.status === filter;
}

function syncResolvedButton() {
  if (!els.viewResolvedBtn) return;
  const viewingResolved = state.statusFilter === "done" || state.statusFilter === "all";
  els.viewResolvedBtn.textContent = viewingResolved ? "Hide resolved" : "View resolved";
  els.viewResolvedBtn.classList.toggle("primary", state.statusFilter === "done");
}

function visibleTickets() {
  // Filter the sidebar list, but always keep the open conversation visible
  // so replies stay on screen after Resolved / Waiting / etc.
  const selected = selectedTicket();
  let list = state.tickets.filter((t) => ticketMatchesFilter(t, state.statusFilter));

  if (selected && !list.some((t) => String(t.id) === String(selected.id))) {
    list = [selected, ...list];
  }
  return list;
}

function renderTicketList() {
  const tickets = visibleTickets();
  if (!state.tickets.length && !selectedTicket()) {
    els.ticketList.innerHTML = `<p class="muted">No tickets yet.</p>`;
    return;
  }
  if (!tickets.length) {
    const hint =
      state.statusFilter === "active"
        ? `No active tickets. Click “View resolved” to see completed ones.`
        : `No tickets in this status.`;
    els.ticketList.innerHTML = `<p class="muted">${hint}</p>`;
    return;
  }
  els.ticketList.innerHTML = tickets
    .map((t) => {
      const active = String(t.id) === String(state.selectedId) ? "active" : "";
      return `
        <button class="item ${active}" type="button" data-id="${escapeHtml(t.id)}">
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
  if (state.selectedTicket && String(state.selectedTicket.id) === String(state.selectedId)) {
    return state.selectedTicket;
  }
  const fromList = state.tickets.find((t) => String(t.id) === String(state.selectedId));
  if (fromList) {
    state.selectedTicket = fromList;
    return fromList;
  }
  return state.selectedTicket || null;
}

function selectTicket(ticketOrId) {
  if (ticketOrId && typeof ticketOrId === "object") {
    state.selectedTicket = ticketOrId;
    state.selectedId = ticketOrId.id;
    upsertTicket(ticketOrId);
    return;
  }
  state.selectedId = ticketOrId || null;
  if (!ticketOrId) {
    state.selectedTicket = null;
    return;
  }
  const found = state.tickets.find((t) => String(t.id) === String(ticketOrId));
  state.selectedTicket = found || state.selectedTicket;
}

function renderMessageBubble(ticket, message) {
  const author = message && message.author === "admin" ? "admin" : "client";
  const who = author === "admin" ? "You" : "Client";
  let attachmentsHtml = "";
  try {
    if (window.TicketAttachments && window.TicketAttachments.renderAttachmentsHtml) {
      attachmentsHtml = window.TicketAttachments.renderAttachmentsHtml(ticket, message) || "";
    }
  } catch {
    attachmentsHtml = "";
  }
  return `
    <div class="bubble ${author}">
      <div class="who">${who} · ${formatWhen(message && message.createdAt)}</div>
      <div class="bubble-body">${escapeHtml((message && message.body) || "")}</div>
      ${attachmentsHtml}
    </div>`;
}

function renderTicketDetail() {
  const t = selectedTicket();
  if (!t) {
    els.ticketDetail.innerHTML = `<p class="muted">Select a ticket to reply or update status.</p>`;
    return;
  }

  const messageList = Array.isArray(t.messages) ? t.messages : [];
  const messages = messageList.map((m) => renderMessageBubble(t, m)).join("");
  const messageCount = messageList.length;
  const adminCount = messageList.filter((m) => m && m.author === "admin").length;

  els.ticketDetail.innerHTML = `
    <div class="detail-chrome">
      <div class="detail-head">
        <div>
          <h2 style="font-size:1.15rem;margin-bottom:0.35rem;">${escapeHtml(t.subject)}</h2>
          <div class="meta">${escapeHtml(t.clientName || t.clientSlug)} · ${escapeHtml(t.requesterName)} &lt;${escapeHtml(t.requesterEmail)}&gt;</div>
        </div>
        ${statusBadge(t.status)}
      </div>
      <div class="detail-subrow">
        <p class="meta track-link">Track: <a href="/t/${encodeURIComponent(t.trackToken)}/" target="_blank" rel="noopener">/t/${escapeHtml(t.trackToken)}/</a></p>
        <p class="meta message-count">${messageCount} message${messageCount === 1 ? "" : "s"}${adminCount ? ` · ${adminCount} from you` : ""}</p>
      </div>
      <div class="actions status-actions">
        <button class="btn" type="button" data-status="open">Open</button>
        <button class="btn" type="button" data-status="in_progress">In progress</button>
        <button class="btn" type="button" data-status="waiting_on_customer">Waiting for customer</button>
        <button class="btn primary" type="button" data-status="done">Mark resolved</button>
        <button class="btn danger" type="button" id="deleteTicketBtn">Delete ticket</button>
      </div>
    </div>
    <div class="thread" id="ticketThread">${messages || '<p class="muted">No messages yet.</p>'}</div>
    <form id="replyForm" class="reply-composer">
      <div class="field">
        <label for="replyBody">Reply</label>
        <textarea id="replyBody" placeholder="Write a reply..."></textarea>
      </div>
      <div class="reply-actions">
        <div class="field" style="margin-bottom:0;flex:1;">
          <label for="replyAttachments">Attach file or screenshot</label>
          <input id="replyAttachments" type="file" accept="image/*,.pdf,.txt,application/pdf,text/plain" multiple />
        </div>
        <button class="btn primary" type="submit">Send reply</button>
      </div>
      <p class="status" id="detailStatus"></p>
    </form>
  `;

  els.ticketDetail.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (state.statusUpdatingId) return;
      const detailStatus = document.getElementById("detailStatus");
      const previous = selectedTicket() || t;
      const nextStatus = btn.dataset.status;
      if (!nextStatus || (previous && previous.status === nextStatus)) return;

      state.statusUpdatingId = String(t.id);

      // Optimistic UI so the badge/list update immediately.
      const optimistic = {
        ...previous,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      showTicket(optimistic);
      document.querySelectorAll("#ticketDetail [data-status]").forEach((b) => {
        b.disabled = true;
      });
      const liveStatus = document.getElementById("detailStatus");
      setStatus(liveStatus || detailStatus, "Updating…");

      try {
        const data = await api("tickets-status", {
          method: "POST",
          body: JSON.stringify({ id: t.id, status: nextStatus }),
        });
        const next = mergeTicketUpdate(data.ticket, optimistic);
        showTicket(next);
        syncResolvedButton();
        setStatus(els.globalStatus, "Status updated.", "ok");
      } catch (error) {
        showTicket(previous);
        const errStatus = document.getElementById("detailStatus");
        setStatus(errStatus || detailStatus, error.message, "error");
      } finally {
        state.statusUpdatingId = null;
      }
    });
  });

  const deleteBtn = document.getElementById("deleteTicketBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const detailStatus = document.getElementById("detailStatus");
      const label = t.subject || t.id;
      if (
        !window.confirm(
          `Delete ticket “${label}”? This cannot be undone, and the public track link will stop working.`
        )
      ) {
        return;
      }
      try {
        setStatus(detailStatus, "Deleting…");
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Deleting…";
        await api("tickets-delete", {
          method: "POST",
          body: JSON.stringify({ id: t.id }),
        });
        state.tickets = state.tickets.filter((item) => String(item.id) !== String(t.id));
        state.selectedId = null;
        state.selectedTicket = null;
        renderTicketList();
        renderTicketDetail();
        setStatus(els.globalStatus, "Ticket deleted.", "ok");
      } catch (error) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete ticket";
        setStatus(detailStatus, error.message, "error");
      }
    });
  }

  scrollThreadToEnd();

  const replyForm = document.getElementById("replyForm");
  const replyBtn = replyForm.querySelector('button[type="submit"]');
  replyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (replyBtn && replyBtn.disabled) return;
    const detailStatus = document.getElementById("detailStatus");
    const body = document.getElementById("replyBody").value.trim();
    const fileInput = document.getElementById("replyAttachments");
    const previous = selectedTicket();
    if (replyBtn) {
      replyBtn.disabled = true;
      replyBtn.textContent = "Sending…";
    }
    try {
      setStatus(detailStatus, "Sending…");
      const attachments = await window.TicketAttachments.filesFromInput(fileInput);
      if (!body && !attachments.length) {
        throw new Error("Add a message or attachment.");
      }
      const data = await api("tickets-reply", {
        method: "POST",
        body: JSON.stringify({ id: t.id, message: body, attachments }),
      });
      const next = mergeTicketUpdate(data.ticket, previous);
      showTicket(next);
      syncResolvedButton();
      setStatus(els.globalStatus, "Reply sent.", "ok");
    } catch (error) {
      if (replyBtn) {
        replyBtn.disabled = false;
        replyBtn.textContent = "Send reply";
      }
      setStatus(detailStatus, error.message, "error");
    }
  });
}

function scrollThreadToEnd() {
  const threadEl = document.getElementById("ticketThread") || els.ticketDetail.querySelector(".thread");
  if (!threadEl) return;
  const run = () => {
    threadEl.scrollTop = threadEl.scrollHeight;
  };
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
}

function preserveMessages(incoming, previous) {
  if (!incoming) return previous || null;
  if (!previous || String(previous.id) !== String(incoming.id)) return incoming;
  const incomingMessages = Array.isArray(incoming.messages) ? incoming.messages : [];
  const previousMessages = Array.isArray(previous.messages) ? previous.messages : [];
  if (incomingMessages.length >= previousMessages.length) return incoming;
  return { ...incoming, messages: previousMessages };
}

function mergeTicketUpdate(incoming, previous) {
  if (!incoming) return previous || null;
  if (!previous || String(previous.id) !== String(incoming.id)) return incoming;
  const merged = preserveMessages(incoming, previous);
  // Prefer the newer status/updatedAt so a stale refetch cannot roll the UI back.
  const incomingUpdated = Date.parse(incoming.updatedAt || "") || 0;
  const previousUpdated = Date.parse(previous.updatedAt || "") || 0;
  if (previousUpdated > incomingUpdated) {
    return {
      ...merged,
      status: previous.status,
      updatedAt: previous.updatedAt,
    };
  }
  return merged;
}

function upsertTicket(ticket) {
  if (!ticket || !ticket.id) return;
  const idx = state.tickets.findIndex((t) => String(t.id) === String(ticket.id));
  if (idx >= 0) state.tickets[idx] = ticket;
  else state.tickets.unshift(ticket);
  state.tickets.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function fetchTicket(id) {
  const data = await api(`tickets-get?id=${encodeURIComponent(id)}`);
  return data.ticket || null;
}

function showTicket(ticket) {
  if (!ticket) return;
  selectTicket(ticket);
  renderTicketList();
  renderTicketDetail();
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
  // Always load the full set; status filtering is client-side so an open
  // ticket (and its replies) never disappear when status changes.
  const selectedId = state.selectedId;
  const data = await api("tickets-list?status=all");
  state.tickets = data.tickets || [];
  if (selectedId) {
    const latest = state.tickets.find((t) => String(t.id) === String(selectedId));
    if (latest) {
      state.selectedTicket = latest;
      state.selectedId = latest.id;
    } else if (state.selectedTicket && String(state.selectedTicket.id) === String(selectedId)) {
      // Keep the open conversation even if it briefly missing from the list payload.
      upsertTicket(state.selectedTicket);
    }
  }
  if (els.statusFilter) els.statusFilter.value = state.statusFilter;
  syncResolvedButton();
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
  syncResolvedButton();
  // Re-render only — do not clear the selected ticket or its replies.
  renderTicketList();
  renderTicketDetail();
});

els.viewResolvedBtn.addEventListener("click", () => {
  if (state.statusFilter === "done") {
    state.statusFilter = "active";
  } else {
    state.statusFilter = "done";
  }
  if (els.statusFilter) els.statusFilter.value = state.statusFilter;
  syncResolvedButton();
  renderTicketList();
  renderTicketDetail();
});

els.ticketList.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-id]");
  if (!item) return;
  const id = item.dataset.id;
  selectTicket(id);
  renderTicketList();
  renderTicketDetail();
  try {
    const fresh = await fetchTicket(id);
    if (fresh && String(state.selectedId) === String(id)) {
      await showTicket(fresh);
    }
  } catch {
    // keep list copy if single-ticket refresh fails
  }
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
