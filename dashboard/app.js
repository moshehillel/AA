(function () {
  "use strict";

  function getClientSlug() {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[0] || "";
  }

  const slug = getClientSlug();
  const client = window.CLIENTS && window.CLIENTS[slug];

  if (!client) {
    document.getElementById("dashboardTitle").textContent = "Dashboard not found";
    document.getElementById("dashboardMain").innerHTML =
      '<p class="error-banner">No dashboard is configured for this address.</p>';
    return;
  }

  document.title = `${client.name} — Dashboard`;
  document.getElementById("dashboardTitle").textContent = `${client.name} Dashboard`;

  const BASE_URL = client.functionsBaseUrl;
  const TENANT_ID = client.tenantId || "default";
  const TMS = (client.tms || "primus").toLowerCase();
  const tenantQuery = `tenantId=${encodeURIComponent(TENANT_ID)}`;

  const els = {
    tmsBadge: document.getElementById("tmsBadge"),
    tenantLabel: document.getElementById("tenantLabel"),
    taiHintBanner: document.getElementById("taiHintBanner"),
    badge: document.getElementById("gmailStatusBadge"),
    connectBtn: document.getElementById("connectGmailBtn"),
    disconnectBtn: document.getElementById("disconnectGmailBtn"),
    runEmailCheckBtn: document.getElementById("runEmailCheckBtn"),
    runResultBanner: document.getElementById("runResultBanner"),
    rangeBtns: Array.from(document.querySelectorAll(".range-btn")),
    statInvoices: document.getElementById("statInvoices"),
    statReplied: document.getElementById("statReplied"),
    statForwarded: document.getElementById("statForwarded"),
    errorBanner: document.getElementById("errorBanner"),
    chartCanvas: document.getElementById("statsChart"),
    refreshLogsBtn: document.getElementById("refreshLogsBtn"),
    logsContainer: document.getElementById("logsContainer"),
    refreshInvoicesBtn: document.getElementById("refreshInvoicesBtn"),
    invoicesContainer: document.getElementById("invoicesContainer"),
  };

  let chart = null;
  let activeRange = "week";

  // TMS badge + tenant label
  if (els.tmsBadge) {
    els.tmsBadge.hidden = false;
    els.tmsBadge.textContent = TMS === "tai" ? "TAI TMS" : "Primus TMS";
    els.tmsBadge.className = `tms-badge tms-${TMS}`;
  }
  if (els.tenantLabel) {
    els.tenantLabel.hidden = false;
    els.tenantLabel.textContent = `Tenant: ${TENANT_ID}`;
  }
  if (els.taiHintBanner && TMS === "tai") {
    els.taiHintBanner.hidden = false;
  }

  function showError(message) {
    if (!message) {
      els.errorBanner.hidden = true;
      els.errorBanner.textContent = "";
      return;
    }
    els.errorBanner.hidden = false;
    els.errorBanner.textContent = message;
  }

  async function fetchJson(path) {
    const sep = path.includes("?") ? "&" : "?";
    const response = await fetch(`${BASE_URL}${path}${sep}${tenantQuery}`);
    if (!response.ok) {
      throw new Error(`Request to ${path} failed (${response.status})`);
    }
    return response.json();
  }

  async function postJson(path, body) {
    const response = await fetch(`${BASE_URL}${path}?${tenantQuery}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: body ? JSON.stringify({...body, tenantId: TENANT_ID}) : undefined,
    });
    if (!response.ok) {
      throw new Error(`Request to ${path} failed (${response.status})`);
    }
    return response.json();
  }

  async function loadGmailStatus() {
    try {
      const data = await fetchJson("/getGmailStatus");
      if (data.connected) {
        els.badge.textContent = "Gmail connected";
        els.badge.className = "badge badge-connected";
        els.connectBtn.textContent = "Reconnect Gmail";
        els.disconnectBtn.hidden = false;
      } else {
        els.badge.textContent = "Gmail not connected";
        els.badge.className = "badge badge-disconnected";
        els.connectBtn.textContent = "Connect Gmail";
        els.disconnectBtn.hidden = true;
      }
    } catch (error) {
      els.badge.textContent = "Status unavailable";
      els.badge.className = "badge badge-unknown";
      console.error("loadGmailStatus failed:", error);
    }
  }

  function formatLogTime(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return isNaN(d) ? ts : d.toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `$${n.toFixed(2)}`;
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "completed") return "status-completed";
    if (s === "running") return "status-running";
    if (s === "waiting_manual" || s === "failed") return "status-attention";
    return "status-neutral";
  }

  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      els.logsContainer.innerHTML =
        '<p class="logs-empty">No activity yet.</p>';
      return;
    }
    const rows = logs.map((log) => {
      const level = (log.level || "info").toLowerCase();
      return `<tr>
        <td class="log-time">${formatLogTime(log.timestamp)}</td>
        <td><span class="log-level log-level-${level}">${level}</span></td>
        <td><span class="log-category">${log.category || "—"}</span></td>
        <td class="log-message">${log.message || "—"}</td>
      </tr>`;
    }).join("");
    els.logsContainer.innerHTML =
      `<table class="logs-table">
        <thead><tr>
          <th>Time</th><th>Level</th><th>Category</th><th>Message</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  async function loadLogs() {
    els.refreshLogsBtn.disabled = true;
    try {
      const data = await fetchJson("/getRecentLogs?limit=40");
      renderLogs(data.logs || []);
    } catch (error) {
      els.logsContainer.innerHTML =
        '<p class="logs-empty">Could not load logs.</p>';
      console.error("loadLogs failed:", error);
    } finally {
      els.refreshLogsBtn.disabled = false;
    }
  }

  function renderInvoices(invoices) {
    if (!invoices || invoices.length === 0) {
      els.invoicesContainer.innerHTML =
        '<p class="panel-empty">No invoices yet.</p>';
      return;
    }

    const taiHeader = TMS === "tai" ? "<th>TAI Shipment</th>" : "";
    const rows = invoices.map((inv) => {
      const status = inv.finalWorkflowStatus || inv.decisionStage || "—";
      const taiCol = TMS === "tai" ?
        `<td>${inv.taiShipmentId || "—"}</td>` : "";
      return `<tr>
        <td class="log-time">${formatLogTime(inv.createdAt)}</td>
        <td>${inv.loadNumber || "—"}</td>
        <td>${inv.proNumber || "—"}</td>
        <td>${inv.carrierName || "—"}</td>
        <td>${formatMoney(inv.invoiceAmount)}</td>
        ${taiCol}
        <td><span class="status-pill ${statusClass(status)}">${status}</span></td>
        <td class="log-message">${inv.decisionReason || inv.currentStep || "—"}</td>
      </tr>`;
    }).join("");

    els.invoicesContainer.innerHTML =
      `<table class="logs-table">
        <thead><tr>
          <th>Created</th><th>Load #</th><th>PRO</th><th>Carrier</th>
          <th>Amount</th>${taiHeader}<th>Status</th><th>Detail</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  async function loadInvoices() {
    els.refreshInvoicesBtn.disabled = true;
    try {
      const data = await fetchJson("/getRecentInvoices?limit=20");
      renderInvoices(data.invoices || []);
    } catch (error) {
      els.invoicesContainer.innerHTML =
        '<p class="panel-empty">Could not load invoices.</p>';
      console.error("loadInvoices failed:", error);
    } finally {
      els.refreshInvoicesBtn.disabled = false;
    }
  }

  function formatPeriodLabel(period, range) {
    const date = new Date(period);
    if (range === "year") {
      return date.toLocaleDateString(undefined, {month: "short", year: "numeric"});
    }
    return date.toLocaleDateString(undefined, {month: "short", day: "numeric"});
  }

  function renderChart(series, range) {
    const labels = series.map((row) => formatPeriodLabel(row.period, range));
    const datasets = [
      {
        label: "Invoices processed",
        data: series.map((row) => row.invoicesProcessed),
        borderColor: "#4f46e5",
        backgroundColor: "#4f46e5",
        tension: 0.3,
      },
      {
        label: "Emails replied",
        data: series.map((row) => row.emailsReplied),
        borderColor: "#16a34a",
        backgroundColor: "#16a34a",
        tension: 0.3,
      },
      {
        label: "Emails forwarded for review",
        data: series.map((row) => row.emailsForwarded),
        borderColor: "#dc2626",
        backgroundColor: "#dc2626",
        tension: 0.3,
      },
    ];

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets = datasets;
      chart.update();
      return;
    }

    chart = new Chart(els.chartCanvas, {
      type: "line",
      data: {labels, datasets},
      options: {
        responsive: true,
        scales: {
          y: {beginAtZero: true, ticks: {precision: 0}},
        },
      },
    });
  }

  async function loadStats(range) {
    showError(null);
    try {
      const data = await fetchJson(`/getDashboardStats?range=${range}`);
      els.statInvoices.textContent = data.totals.invoicesProcessed;
      els.statReplied.textContent = data.totals.emailsReplied;
      els.statForwarded.textContent = data.totals.emailsForwarded;
      renderChart(data.series, range);
    } catch (error) {
      console.error("loadStats failed:", error);
      showError("Couldn't load dashboard stats. Please try again shortly.");
    }
  }

  function setActiveRange(range) {
    activeRange = range;
    els.rangeBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.range === range);
    });
    loadStats(range);
  }

  els.rangeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setActiveRange(btn.dataset.range));
  });

  els.connectBtn.addEventListener("click", () => {
    window.location.href =
      `${BASE_URL}/gmailConnect?${tenantQuery}`;
  });

  els.disconnectBtn.addEventListener("click", async () => {
    if (!confirm("Disconnect Gmail? The system will stop processing emails until you reconnect.")) return;
    els.disconnectBtn.disabled = true;
    try {
      const data = await postJson("/gmailDisconnect");
      if (data.ok) {
        await loadGmailStatus();
        showRunResult("Gmail disconnected.", false);
      } else {
        showRunResult("Disconnect failed: " + (data.error || "unknown error"), true);
      }
    } catch (error) {
      showRunResult("Could not reach the server.", true);
    } finally {
      els.disconnectBtn.disabled = false;
    }
  });

  els.refreshLogsBtn.addEventListener("click", loadLogs);
  els.refreshInvoicesBtn.addEventListener("click", loadInvoices);

  function showRunResult(message, isError) {
    els.runResultBanner.textContent = message;
    els.runResultBanner.className =
      "run-result-banner " + (isError ? "is-error" : "is-success");
    els.runResultBanner.hidden = false;
  }

  els.runEmailCheckBtn.addEventListener("click", async () => {
    els.runEmailCheckBtn.disabled = true;
    els.runEmailCheckBtn.textContent = "Checking…";
    els.runResultBanner.hidden = true;

    try {
      const data = await postJson("/checkGmailInbox");
      if (data.ok) {
        const tenantResult = Array.isArray(data.tenants) ?
          data.tenants.find((t) => t.tenantId === TENANT_ID) ||
          data.tenants[0] : null;
        const processed = tenantResult ?
          (tenantResult.processed || 0) :
          (data.processedMessages || 0);
        const connected = tenantResult ? tenantResult.connected !== false : true;

        if (tenantResult && tenantResult.connected === false) {
          showRunResult("Gmail is not connected for this tenant.", true);
        } else {
          showRunResult(
            processed === 0 ?
              "Inbox checked — no new emails to process." :
              `Done — queued ${processed} email${processed === 1 ? "" : "s"}.`,
            false,
          );
        }
        loadStats(activeRange);
        loadInvoices();
        loadLogs();
      } else {
        showRunResult(
          "Check failed: " + (data.error || "unknown error"),
          true,
        );
      }
    } catch (error) {
      showRunResult("Could not reach the server. Please try again.", true);
      console.error("runEmailCheck failed:", error);
    } finally {
      els.runEmailCheckBtn.disabled = false;
      els.runEmailCheckBtn.textContent = "Check Inbox";
    }
  });

  // ---- Support chat ----

  const chatEls = {
    toggle: document.getElementById("supportChatToggle"),
    panel: document.getElementById("supportChatPanel"),
    close: document.getElementById("supportChatClose"),
    log: document.getElementById("supportChatLog"),
    form: document.getElementById("supportChatForm"),
    input: document.getElementById("supportChatInput"),
  };

  const chatHistory = [];
  let chatBusy = false;
  let chatStarted = false;

  function appendChatMessage(role, text) {
    const bubble = document.createElement("p");
    bubble.className = `support-chat-msg from-${role}`;
    bubble.textContent = text;
    chatEls.log.appendChild(bubble);
    chatEls.log.scrollTop = chatEls.log.scrollHeight;
    return bubble;
  }

  function openChat() {
    chatEls.panel.hidden = false;
    chatEls.toggle.classList.add("is-hidden");
    chatEls.input.focus();
    if (!chatStarted) {
      chatStarted = true;
      appendChatMessage(
        "bot",
        `Hi! I'm the support assistant for ${client.name}. What's going ` +
          "on — what did you expect to see, and what are you seeing " +
          "instead?",
      );
    }
  }

  function closeChat() {
    chatEls.panel.hidden = true;
    chatEls.toggle.classList.remove("is-hidden");
  }

  function endChat() {
    appendChatMessage(
      "system",
      "This has been passed along to our team — thanks for the details!",
    );
    chatEls.input.disabled = true;
    chatEls.form.querySelector(".support-chat-send").disabled = true;
  }

  async function sendChatMessage(text) {
    chatHistory.push({role: "user", content: text});
    appendChatMessage("user", text);

    const pending = appendChatMessage("bot", "Thinking…");
    pending.classList.add("is-pending");
    chatBusy = true;
    chatEls.input.disabled = true;

    try {
      const response = await fetch(`${BASE_URL}/dashboardSupportChat`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          clientName: client.name,
          tenantId: TENANT_ID,
          tms: TMS,
          messages: chatHistory,
        }),
      });
      if (!response.ok) {
        throw new Error(`Chat request failed (${response.status})`);
      }
      const data = await response.json();
      pending.remove();

      const reply = (data && data.reply) ||
        "Sorry, something went wrong on our end. Please try again.";
      appendChatMessage("bot", reply);
      chatHistory.push({role: "assistant", content: reply});

      if (data && data.done) {
        endChat();
        return;
      }
    } catch (error) {
      pending.remove();
      appendChatMessage(
          "bot",
          "Sorry, I couldn't reach the support assistant. Please try " +
            "again in a moment.",
      );
      console.error("sendChatMessage failed:", error);
    } finally {
      chatBusy = false;
      chatEls.input.disabled = false;
      chatEls.input.focus();
    }
  }

  function autoGrowChatInput() {
    chatEls.input.style.height = "auto";
    chatEls.input.style.height = `${chatEls.input.scrollHeight}px`;
  }

  if (chatEls.toggle && chatEls.panel) {
    chatEls.toggle.addEventListener("click", openChat);
    chatEls.close.addEventListener("click", closeChat);
    chatEls.input.addEventListener("input", autoGrowChatInput);

    chatEls.form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (chatBusy) {
        return;
      }
      const text = chatEls.input.value.trim();
      if (!text) {
        return;
      }
      chatEls.input.value = "";
      autoGrowChatInput();
      sendChatMessage(text);
    });

    chatEls.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chatEls.form.requestSubmit();
      }
    });
  }

  loadGmailStatus();
  setActiveRange(activeRange);
  loadInvoices();
  loadLogs();
})();
