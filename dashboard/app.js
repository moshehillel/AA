(function () {
  "use strict";

  function getClientSlug() {
    // The Edge Function rewrites "/<slug>[/...]" to "/dashboard/...", so the
    // first path segment the browser shows is the client slug.
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

  const els = {
    badge: document.getElementById("gmailStatusBadge"),
    connectBtn: document.getElementById("connectGmailBtn"),
    runEmailCheckBtn: document.getElementById("runEmailCheckBtn"),
    runResultBanner: document.getElementById("runResultBanner"),
    rangeBtns: Array.from(document.querySelectorAll(".range-btn")),
    statInvoices: document.getElementById("statInvoices"),
    statReplied: document.getElementById("statReplied"),
    statForwarded: document.getElementById("statForwarded"),
    errorBanner: document.getElementById("errorBanner"),
    chartCanvas: document.getElementById("statsChart"),
  };

  let chart = null;
  let activeRange = "week";

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
    const response = await fetch(`${BASE_URL}${path}`);
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
      } else {
        els.badge.textContent = "Gmail not connected";
        els.badge.className = "badge badge-disconnected";
        els.connectBtn.textContent = "Connect Gmail";
      }
    } catch (error) {
      els.badge.textContent = "Status unavailable";
      els.badge.className = "badge badge-unknown";
      console.error("loadGmailStatus failed:", error);
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
    window.location.href = `${BASE_URL}/gmailConnect`;
  });

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
      const response = await fetch(`${BASE_URL}/checkGmailInbox`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.ok) {
        const n = data.processedMessages || 0;
        showRunResult(
          n === 0
            ? "Inbox checked — no new emails to process."
            : `Done — processed ${n} email${n === 1 ? "" : "s"}.`,
          false,
        );
        loadStats(activeRange);
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
})();
