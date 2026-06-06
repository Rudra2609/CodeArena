/**
 * popup.js — Judge Bridge popup logic  v2.0
 *
 * 1. On open: inject content script + send extractTestCases message
 * 2. Display test cases in tabs
 * 3. "Open in Judge"  → background opens localhost with URL params
 * 4. "Copy Input"     → clipboard
 * 5. "Run All"        → open judge for every test case (staggered)
 */

"use strict";

// ── DOM refs ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const stateLoading     = $("state-loading");
const stateUnsupported = $("state-unsupported");
const stateError       = $("state-error");
const stateMain        = $("state-main");

const platformBadge   = $("platform-badge");
const problemTitle    = $("problem-title");
const tabsRow         = $("tabs-row");
const stdinDisplay    = $("stdin-display");
const expectedDisplay = $("expected-display");
const langSelect      = $("lang-select");
const btnSend         = $("btn-send");
const btnCopy         = $("btn-copy");
const btnAll          = $("btn-all");
const errorMsg        = $("error-msg");

// ── State ───────────────────────────────────────────────────
let examples    = [];
let activeIdx   = 0;
let problemMeta = { title: "", url: "" };

// ── Supported URL patterns ──────────────────────────────────
function isSupportedUrl(url) {
  if (!url) return false;
  return (
    /codeforces\.com\/(problemset\/problem|contest|gym)\//.test(url) ||
    /hackerrank\.com\/challenges\//.test(url)                        ||
    /atcoder\.jp\/contests\/.*\/tasks\//.test(url)                   ||
    /cses\.fi\/problemset\/task\//.test(url)                         ||
    /codechef\.com\/(.*\/)?problems\//.test(url)
  );
}

// ── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !isSupportedUrl(tab.url)) {
    showState("unsupported");
    return;
  }

  const extractCases = (retry = false) => {
    chrome.tabs.sendMessage(tab.id, { action: "extractTestCases" }, async (response) => {
      if (chrome.runtime.lastError || !response) {
        if (!retry) {
          // Script likely missing. Inject and retry once.
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files:  ["content.js"],
            });
            setTimeout(() => extractCases(true), 150);
          } catch (err) {
            showState("error");
            errorMsg.textContent = `Injection failed: ${err.message}`;
          }
          return;
        }
        showState("error");
        errorMsg.textContent =
          chrome.runtime.lastError?.message || "No response from page. Try refreshing.";
        return;
      }

      if (response.error && !response.examples?.length) {
        showState("error");
        errorMsg.textContent = response.error;
        return;
      }

      render(response);
    });
  };

  extractCases(false);
});

// ── Render ──────────────────────────────────────────────────
function render(data) {
  const { platform, title, url, examples: exs } = data;

  problemMeta = { title: title || "Unknown Problem", url: url || "" };
  examples    = exs || [];

  if (examples.length === 0) {
    showState("unsupported");
    return;
  }

  // Platform badge
  const slug = platform?.toLowerCase().replace(/\s/g, "") || "";
  platformBadge.textContent = platform;
  platformBadge.className   = `platform-badge ${slug}`;

  // Problem title (truncated via CSS ellipsis)
  problemTitle.textContent = problemMeta.title;

  // Build test-case tabs
  tabsRow.innerHTML = "";
  examples.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.className   = `tab${i === 0 ? " active" : ""}`;
    btn.textContent = `Case ${i + 1}`;
    btn.addEventListener("click", () => switchTab(i));
    tabsRow.appendChild(btn);
  });

  switchTab(0);
  showState("main");

  // Restore last-used language
  chrome.storage.local.get("preferredLang", ({ preferredLang }) => {
    if (preferredLang) langSelect.value = preferredLang;
  });
}

function switchTab(idx) {
  activeIdx = idx;
  const { stdin, expected } = examples[idx];
  stdinDisplay.textContent    = stdin    || "(empty)";
  expectedDisplay.textContent = expected || "(empty)";
  document.querySelectorAll(".tab").forEach((t, i) =>
    t.classList.toggle("active", i === idx)
  );
}

// ── Handlers ────────────────────────────────────────────────

btnSend.addEventListener("click", () => {
  const language = langSelect.value;
  chrome.storage.local.set({ preferredLang: language });

  chrome.runtime.sendMessage({
    action:  "openInJudge",
    payload: {
      cases: examples,
      language,
      problemTitle: problemMeta.title,
      problemUrl:   problemMeta.url,
    },
  });
  window.close();
});

btnCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(examples[activeIdx].stdin);
    toast("✓ Copied!");
  } catch {
    toast("Copy failed");
  }
});

// (Run All button logic removed since main button now does it)

// ── Helpers ─────────────────────────────────────────────────

function showState(name) {
  [stateLoading, stateUnsupported, stateError, stateMain]
    .forEach(el => el.classList.add("hidden"));

  ({ loading: stateLoading, unsupported: stateUnsupported,
     error: stateError, main: stateMain })[name]
    ?.classList.remove("hidden");
}

let toastTimer;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = Object.assign(document.createElement("div"), { id: "toast" });
    document.body.appendChild(el);
  }
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.add("show");
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}
