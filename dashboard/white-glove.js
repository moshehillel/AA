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
      '<p class="wg-banner wg-banner-error">White Glove dashboard is not configured for this address.</p>';
    return;
  }

  const PROXY = client.functionsBaseUrl || "/.netlify/functions/whiteGloveProxy";

  const els = {
    errorBanner: document.getElementById("errorBanner"),
    successBanner: document.getElementById("successBanner"),
    reminderBanner: document.getElementById("mfaReminderBanner"),
    headerStatusPill: document.getElementById("headerStatusPill"),
    headerStatusText: document.getElementById("headerStatusText"),
    daysLeftCard: document.getElementById("daysLeftCard"),
    renewedAt: document.getElementById("mfaRenewedAt"),
    expiresAt: document.getElementById("mfaExpiresAt"),
    daysLeft: document.getElementById("mfaDaysLeft"),
    startBtn: document.getElementById("mfaStartBtn"),
    completeForm: document.getElementById("mfaCompleteForm"),
    otpInput: document.getElementById("mfaOtpInput"),
    cancelBtn: document.getElementById("mfaCancelBtn"),
    weekSummaryBtn: document.getElementById("weekSummaryBtn"),
    weekSummaryModal: document.getElementById("weekSummaryModal"),
    weekSummaryTitle: document.getElementById("weekSummaryTitle"),
    weekSummaryRange: document.getElementById("weekSummaryRange"),
    weekSummaryError: document.getElementById("weekSummaryError"),
    weekSummaryLoading: document.getElementById("weekSummaryLoading"),
    weekSummaryLoadingVerb: document.getElementById("weekSummaryLoadingVerb"),
    weekSummaryContent: document.getElementById("weekSummaryContent"),
    weekSummaryStats: document.getElementById("weekSummaryStats"),
    weekSummaryNote: document.getElementById("weekSummaryNote"),
    sandboxRunBtn: document.getElementById("sandboxRunBtn"),
    sandboxResult: document.getElementById("sandboxResult"),
    liveRunBtn: document.getElementById("liveRunBtn"),
    livePresetSessionsBtn: document.getElementById("livePresetSessionsBtn"),
    liveResult: document.getElementById("liveResult"),
  };

  let pendingSessionId = null;
  let weekLoadingTimer = null;
  let weekLoadingIndex = 0;

  const WEEK_LOADING_VERBS = [
    "Thinking",
    "Calculating",
    "Looking",
    "Writing",
    "Making",
    "Cooking",
    "Sorting",
    "Counting",
    "Checking",
    "Gathering",
    "Tallying",
    "Compiling",
  ];

  function easternYmd(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function weekSummaryHeading(windowInfo) {
    const startDate = windowInfo && windowInfo.startDate;
    const endDate = windowInfo && windowInfo.endDate;
    if (!startDate || !endDate) return "Week summary";
    const today = easternYmd(new Date());
    if (today > endDate) return "Last week summary";
    if (today < startDate) return "Upcoming week summary";
    return "This week summary";
  }

  function stopWeekLoadingAnimation() {
    if (weekLoadingTimer) {
      clearInterval(weekLoadingTimer);
      weekLoadingTimer = null;
    }
    if (els.weekSummaryLoadingVerb) {
      els.weekSummaryLoadingVerb.classList.remove("is-fading");
    }
  }

  function startWeekLoadingAnimation() {
    stopWeekLoadingAnimation();
    weekLoadingIndex = 0;
    if (els.weekSummaryLoadingVerb) {
      els.weekSummaryLoadingVerb.textContent = WEEK_LOADING_VERBS[0];
      els.weekSummaryLoadingVerb.classList.remove("is-fading");
    }
    weekLoadingTimer = setInterval(function () {
      if (!els.weekSummaryLoadingVerb) return;
      const verbEl = els.weekSummaryLoadingVerb;
      verbEl.classList.add("is-fading");
      setTimeout(function () {
        weekLoadingIndex = (weekLoadingIndex + 1) % WEEK_LOADING_VERBS.length;
        verbEl.textContent = WEEK_LOADING_VERBS[weekLoadingIndex];
        verbEl.classList.remove("is-fading");
      }, 220);
    }, 1100);
  }

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
      method: opts.method || (action === "status" || action === "weekSummary" ? "GET" : "POST"),
      headers: opts.body ? {"Content-Type": "application/json"} : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  function setHeaderStatus(daysRemaining, needsReminder) {
    if (!els.headerStatusPill || !els.headerStatusText) return;
    els.headerStatusPill.hidden = false;
    els.headerStatusPill.classList.remove(
      "wg-status-pill-good",
      "wg-status-pill-warn",
      "wg-status-pill-bad",
      "wg-status-pill-neutral",
    );

    if (daysRemaining == null) {
      els.headerStatusPill.classList.add("wg-status-pill-neutral");
      els.headerStatusText.textContent = "MFA status unknown";
      return;
    }

    if (daysRemaining <= 0) {
      els.headerStatusPill.classList.add("wg-status-pill-bad");
      els.headerStatusText.textContent = "MFA expired — renew now";
    } else if (needsReminder || daysRemaining <= 7) {
      els.headerStatusPill.classList.add("wg-status-pill-warn");
      els.headerStatusText.textContent = `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} of MFA trust left`;
    } else {
      els.headerStatusPill.classList.add("wg-status-pill-good");
      els.headerStatusText.textContent = `MFA healthy — ${daysRemaining} days left`;
    }
  }

  function setDaysLeftStyle(daysRemaining, needsReminder) {
    if (!els.daysLeftCard) return;
    els.daysLeftCard.classList.remove("wg-stat-warn", "wg-stat-bad");
    if (daysRemaining == null) return;
    if (daysRemaining <= 0) {
      els.daysLeftCard.classList.add("wg-stat-bad");
    } else if (needsReminder || daysRemaining <= 7) {
      els.daysLeftCard.classList.add("wg-stat-warn");
    }
  }

  function renderStatus(data) {
    els.renewedAt.textContent = formatDate(data.renewedAt);
    els.expiresAt.textContent = formatDate(data.expiresAt);
    els.daysLeft.textContent =
      data.daysRemaining == null ? "—" : String(data.daysRemaining);

    els.reminderBanner.hidden = !data.needsReminder;
    setHeaderStatus(data.daysRemaining, data.needsReminder);
    setDaysLeftStyle(data.daysRemaining, data.needsReminder);

    if (els.sandboxRunBtn) {
      els.sandboxRunBtn.disabled = !data.sandboxTriggerConfigured;
      if (!data.sandboxTriggerConfigured) {
        els.sandboxRunBtn.title = "Sandbox trigger is not configured on AWS yet.";
      }
    }
    if (els.liveRunBtn) {
      els.liveRunBtn.disabled = data.liveRunConfigured === false;
      if (data.liveRunConfigured === false) {
        els.liveRunBtn.title = "Live run is not configured on AWS yet (STATE_MACHINE_ARN).";
      }
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
    const submitBtn = els.completeForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;
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
      submitBtn.disabled = false;
    }
  });

  function closeWeekSummaryModal() {
    if (!els.weekSummaryModal) return;
    els.weekSummaryModal.hidden = true;
    stopWeekLoadingAnimation();
  }

  function openWeekSummaryModal() {
    if (!els.weekSummaryModal) return;
    els.weekSummaryModal.hidden = false;
  }

  function statCard(label, value, tone) {
    const toneClass = tone ? ` wg-week-stat-${tone}` : "";
    return (
      `<article class="wg-week-stat${toneClass}">` +
      `<span class="wg-stat-label">${label}</span>` +
      `<strong class="wg-stat-value">${value}</strong>` +
      `</article>`
    );
  }

  function renderWeekSummary(data) {
    const counts = data.counts || {};
    const windowInfo = data.window || {};
    stopWeekLoadingAnimation();
    if (els.weekSummaryTitle) {
      els.weekSummaryTitle.textContent = weekSummaryHeading(windowInfo);
    }
    if (els.weekSummaryRange) {
      els.weekSummaryRange.textContent =
        windowInfo.label ||
        (windowInfo.startDate && windowInfo.endDate
          ? `${windowInfo.startDate} – ${windowInfo.endDate}`
          : "Mon–Sun Eastern ops week");
    }
    if (els.weekSummaryStats) {
      els.weekSummaryStats.innerHTML = [
        statCard("Sessions approved", counts.sessionsApproved ?? 0, "good"),
        statCard("Sessions failed", counts.sessionsFailed ?? 0, counts.sessionsFailed ? "bad" : ""),
        statCard("Sessions skipped", counts.sessionsSkipped ?? 0),
        statCard("New cases entered", counts.newCasesEntered ?? 0, "good"),
        statCard("New cases blocked", counts.newCasesFailed ?? 0, counts.newCasesFailed ? "bad" : ""),
        statCard("New services ok", counts.newServicesSucceeded ?? 0),
        statCard("Closures completed", counts.closuresCompleted ?? 0),
        statCard("Closures blocked", counts.closuresFailed ?? 0, counts.closuresFailed ? "bad" : ""),
        statCard("Exceptions logged", counts.exceptionCount ?? 0),
        statCard("Pipeline runs", counts.runsIncluded ?? 0),
      ].join("");
    }
    if (els.weekSummaryNote) {
      const parts = [];
      if (windowInfo.definition) parts.push(windowInfo.definition);
      if (counts.sessionsFromDryRunOnly) {
        parts.push("Session counts are from Monday dry-run only (no live Tuesday run found).");
      }
      if ((counts.runsIncluded ?? 0) === 0) {
        parts.push("No completed pipeline runs were found for this window.");
      }
      if (Array.isArray(data.runIds) && data.runIds.length) {
        parts.push(
          "Includes validate-summary.json for run(s): " + data.runIds.join(", ") + ".",
        );
      }
      if (data.summariesScanned != null) {
        parts.push("Scanned " + data.summariesScanned + " run summary file(s).");
      }
      els.weekSummaryNote.textContent = parts.join(" ");
    }
    if (els.weekSummaryLoading) els.weekSummaryLoading.hidden = true;
    if (els.weekSummaryContent) els.weekSummaryContent.hidden = false;
  }

  async function loadWeekSummary() {
    if (els.weekSummaryError) {
      els.weekSummaryError.hidden = true;
      els.weekSummaryError.textContent = "";
    }
    if (els.weekSummaryTitle) els.weekSummaryTitle.textContent = "Week summary";
    if (els.weekSummaryLoading) els.weekSummaryLoading.hidden = false;
    if (els.weekSummaryContent) els.weekSummaryContent.hidden = true;
    if (els.weekSummaryRange) els.weekSummaryRange.textContent = "Fetching pipeline counts…";
    startWeekLoadingAnimation();

    try {
      const data = await api("weekSummary");
      renderWeekSummary(data);
    } catch (err) {
      stopWeekLoadingAnimation();
      if (els.weekSummaryLoading) els.weekSummaryLoading.hidden = true;
      if (els.weekSummaryError) {
        els.weekSummaryError.hidden = false;
        els.weekSummaryError.textContent =
          err.message || "Could not load week summary.";
      }
      if (els.weekSummaryRange) els.weekSummaryRange.textContent = "Unavailable";
    }
  }

  if (els.weekSummaryBtn) {
    els.weekSummaryBtn.addEventListener("click", function () {
      openWeekSummaryModal();
      loadWeekSummary();
    });
  }

  document.querySelectorAll("[data-close-week-summary]").forEach(function (el) {
    el.addEventListener("click", closeWeekSummaryModal);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && els.weekSummaryModal && !els.weekSummaryModal.hidden) {
      closeWeekSummaryModal();
    }
  });

  if (els.sandboxRunBtn) {
    els.sandboxRunBtn.addEventListener("click", async function () {
      showError("");
      showSuccess("");
      if (els.sandboxResult) {
        els.sandboxResult.hidden = true;
        els.sandboxResult.textContent = "";
      }

      els.sandboxRunBtn.disabled = true;
      const originalLabel = els.sandboxRunBtn.innerHTML;
      els.sandboxRunBtn.innerHTML =
        '<span class="wg-btn-icon" aria-hidden="true">…</span> Starting sandbox run…';

      try {
        const data = await api("sandbox", {method: "POST"});
        if (els.sandboxResult) {
          els.sandboxResult.hidden = false;
          const runLine = data.runId
            ? `Run ID: <code>${data.runId}</code>. `
            : "";
          els.sandboxResult.innerHTML =
            `${runLine}${data.message || "Sandbox started — check your email for the summary."}`;
        }
        showSuccess("Sandbox run started. You'll receive an email when it finishes.");
      } catch (err) {
        showError(err.message || "Could not start sandbox run.");
      } finally {
        els.sandboxRunBtn.disabled = false;
        els.sandboxRunBtn.innerHTML = originalLabel;
      }
    });
  }

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function easternBusinessDate() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date());
    const g = function (t) { return Number(parts.find(function (p) { return p.type === t; }).value); };
    return new Date(Date.UTC(g("year"), g("month") - 1, g("day")));
  }

  function addUtcDays(d, n) {
    const x = new Date(d.getTime());
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  }

  function tueMonRange(business) {
    const dow = business.getUTCDay();
    const daysSinceTue = (dow + 5) % 7;
    const from = addUtcDays(business, -daysSinceTue);
    return { from: isoDate(from), to: isoDate(addUtcDays(from, 6)) };
  }

  function fillLiveDateDefaults() {
    const today = easternBusinessDate();
    const todayIso = isoDate(today);
    const sessions = tueMonRange(today);
    const map = {
      opened_cases: [todayIso, todayIso],
      closed_cases: [todayIso, todayIso],
      discharge_service: [todayIso, todayIso],
      new_services: [isoDate(addUtcDays(today, -14)), todayIso],
      verified_sessions: [sessions.from, sessions.to],
    };
    Object.keys(map).forEach(function (kind) {
      const fromEl = document.querySelector('input[data-from="' + kind + '"]');
      const toEl = document.querySelector('input[data-to="' + kind + '"]');
      if (fromEl && !fromEl.value) fromEl.value = map[kind][0];
      if (toEl && !toEl.value) toEl.value = map[kind][1];
    });
  }

  if (els.livePresetSessionsBtn) {
    els.livePresetSessionsBtn.addEventListener("click", function () {
      document.querySelectorAll("#liveReports input[data-kind]").forEach(function (cb) {
        const kind = cb.getAttribute("data-kind");
        cb.checked = kind === "verified_sessions" || kind === "caregiver_codes";
      });
    });
  }

  if (els.liveRunBtn) {
    els.liveRunBtn.addEventListener("click", async function () {
      showError("");
      showSuccess("");
      if (els.liveResult) {
        els.liveResult.hidden = true;
        els.liveResult.textContent = "";
      }

      const reportKinds = [];
      const dateRanges = {};
      document.querySelectorAll("#liveReports input[data-kind]").forEach(function (cb) {
        if (!cb.checked) return;
        const kind = cb.getAttribute("data-kind");
        reportKinds.push(kind);
        const fromEl = document.querySelector('input[data-from="' + kind + '"]');
        const toEl = document.querySelector('input[data-to="' + kind + '"]');
        if (fromEl && toEl && fromEl.value && toEl.value) {
          dateRanges[kind] = { from: fromEl.value, to: toEl.value };
        }
      });
      if (!reportKinds.length) {
        showError("Select at least one report for the live run.");
        return;
      }

      els.liveRunBtn.disabled = true;
      const originalLabel = els.liveRunBtn.innerHTML;
      els.liveRunBtn.innerHTML =
        '<span class="wg-btn-icon" aria-hidden="true">…</span> Starting live run…';

      try {
        const data = await api("startLiveRun", {
          method: "POST",
          body: { confirm: "LIVE", reportKinds: reportKinds, dateRanges: dateRanges },
        });
        if (els.liveResult) {
          els.liveResult.hidden = false;
          const kinds = (data.reportKinds || reportKinds).join(", ");
          const runLine = data.runId ? "Run ID: <code>" + data.runId + "</code>. " : "";
          els.liveResult.innerHTML =
            runLine +
            (data.message || "Live run started.") +
            " Reports: <code>" + kinds + "</code>.";
        }
        showSuccess("Live run started (production HHA writes). Email arrives when finished.");
      } catch (err) {
        showError(err.message || "Could not start live run.");
      } finally {
        els.liveRunBtn.disabled = false;
        els.liveRunBtn.innerHTML = originalLabel;
      }
    });
  }

  fillLiveDateDefaults();
  loadStatus();
})();