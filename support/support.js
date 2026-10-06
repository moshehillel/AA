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
};

function setStatus(el, message, type = "") {
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
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function showLoggedIn(client) {
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  els.logoutBtn.classList.remove("hidden");
  els.subtitle.textContent = client ? `${client.name} · submit and track requests` : "Signed in";
}

function showLoggedOut() {
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
  els.subtitle.textContent = "Sign in to submit and track requests";
}

function renderTickets(tickets) {
  if (!tickets.length) {
    els.ticketList.innerHTML = `<p class="meta">No tickets yet. Submit a request on the left.</p>`;
    return;
  }
  els.ticketList.innerHTML = tickets
    .map((t) => {
      const trackUrl = `${window.location.origin}/t/${encodeURIComponent(t.trackToken)}/`;
      return `
        <div class="item">
          <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:start;">
            <h3>${escapeHtml(t.subject)}</h3>
            <span class="badge ${t.status}">${t.status.replace("_", " ")}</span>
          </div>
          <div class="meta">${formatWhen(t.updatedAt)}</div>
          <div class="actions">
            <a class="btn ghost" href="${trackUrl}" target="_blank" rel="noopener">Open track link</a>
            <button class="btn ghost" type="button" data-copy="${trackUrl}">Copy link</button>
          </div>
        </div>
      `;
    })
    .join("");

  els.ticketList.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.textContent = "Copy link";
        }, 1200);
      } catch {
        prompt("Copy this track link:", btn.dataset.copy);
      }
    });
  });
}

async function loadTickets() {
  const data = await api("tickets-list");
  renderTickets(data.tickets || []);
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
    setStatus(els.createStatus, "Submitting…");
    const data = await api("tickets-create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    els.createForm.reset();
    setStatus(
      els.createStatus,
      `Submitted. Track link: ${data.trackUrl}`,
      "ok"
    );
    await loadTickets();
  } catch (error) {
    setStatus(els.createStatus, error.message, "error");
  }
});

bootstrap();
