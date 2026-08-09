(function () {
  "use strict";

  function getClientSlug() {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[0] || "";
  }

  const slug = getClientSlug();
  const client = window.CLIENTS && window.CLIENTS[slug];
  if (!client || client.dashboardType !== "white-glove") {
    document.getElementById("dashboardTitle").textContent = "Dashboard not found";
    document.getElementById("dashboardMain").innerHTML =
      '<p class="error-banner">White Glove dashboard is not configured for this address.</p>';
    return;
  }

  const PROXY = client.functionsBaseUrl || "/.netlify/functions/whiteGloveProxy";

  const els = {
    errorBanner: document.getElementById("errorBanner"),
    successBanner: document.getElementById("successBanner"),
    reminderBanner: document.getElementById("mfaReminderBanner"),
    renewedAt: document.getElementById("mfaRenewedAt"),
    expiresAt: document.getElementById("mfaExpiresAt"),
    daysLeft: document.getElementById("mfaDaysLeft"),
    startBtn: document.getElementById("mfaStartBtn"),
    completeForm: document.getElementById("mfaCompleteForm"),
    otpInput: document.getElementById("mfaOtpInput"),
    cancelBtn: document.getElementById("mfaCancelBtn"),
    pipelineLink: document.getElementById("pipelineConsoleLink"),
    sandboxLink: document.getElementById("sandboxLink"),
  };

  let pendingSessionId = null;

  function showError(msg) {
    els.errorBanner.hidden = !msg;
    els.errorBanner.textContent = msg || "";
  }

  function showSuccess(msg) {
    els.successBanner.hidden = !msg;
    els.successBanner.textContent = msg || "";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  async function api(action, options) {
    const opts = options || {};
    const url = `${PROXY}?action=${encodeURIComponent(action)}`;
    const response = await fetch(url, {
      method: opts.method || (action === "status" ? "GET" : "POST"),
      headers: opts.body ? {"Content-Type": "application/json"} : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  function renderStatus(data) {
    els.renewedAt.textContent = formatDate(data.renewedAt);
    els.expiresAt.textContent = formatDate(data.expiresAt);
    els.daysLeft.textContent =
      data.daysRemaining == null ? "—" : String(data.daysRemaining);

    if (data.needsReminder) {
      els.reminderBanner.hidden = false;
    } else {
      els.reminderBanner.hidden = true;
    }

    if (data.pipelineConsoleUrl && els.pipelineLink) {
      els.pipelineLink.href = data.pipelineConsoleUrl;
    }
    if (data.sandboxTriggerConfigured && client.sandboxUrl && els.sandboxLink) {
      els.sandboxLink.href = client.sandboxUrl;
      els.sandboxLink.hidden = false;
    }
  }

  async function loadStatus() {
    showError("");
    try {
      const data = await api("status");
      renderStatus(data);
    } catch (err) {
      showError(err.message || "Could not load MFA status.");
      console.error(err);
    }
  }

  els.startBtn.addEventListener("click", async function () {
    showError("");
    showSuccess("");
    els.startBtn.disabled = true;
    try {
      const data = await api("start", {method: "POST"});
      pendingSessionId = data.sessionId;
      els.completeForm.hidden = false;
      els.otpInput.focus();
      showSuccess(data.message || "SMS sent — enter the code below.");
    } catch (err) {
      showError(err.message || "Could not start MFA renew.");
    } finally {
      els.startBtn.disabled = false;
    }
  });

  els.cancelBtn.addEventListener("click", function () {
    pendingSessionId = null;
    els.completeForm.hidden = true;
    els.otpInput.value = "";
    showSuccess("");
  });

  els.completeForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!pendingSessionId) {
      showError("Start renew first.");
      return;
    }
    const otp = els.otpInput.value.trim();
    if (!otp) return;

    showError("");
    els.completeForm.querySelector('[type="submit"]').disabled = true;
    try {
      const data = await api("complete", {
        method: "POST",
        body: {sessionId: pendingSessionId, otp: otp},
      });
      pendingSessionId = null;
      els.completeForm.hidden = true;
      els.otpInput.value = "";
      renderStatus(data);
      showSuccess("MFA renewed — new ~30-day trust saved in AWS.");
    } catch (err) {
      showError(err.message || "Could not complete MFA renew.");
    } finally {
      els.completeForm.querySelector('[type="submit"]').disabled = false;
    }
  });

  loadStatus();
})();
