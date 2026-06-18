/**
 * background.js — Judge Bridge service worker
 *
 * Handles opening the judge in a new tab with pre-loaded test case data.
 * URL params are used so no API call is required from the extension
 * (avoids CORS issues with localhost).
 */

const JUDGE_BASE_URL = "http://localhost:8080";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openInJudge") {
    const { stdin, expected, cases, language, problemTitle, problemUrl } = request.payload;

    const params = new URLSearchParams({
      lang:     language,
      problem:  problemTitle,
      source:   problemUrl,
    });

    if (cases) {
      params.append("cases", btoa(unescape(encodeURIComponent(JSON.stringify(cases)))));
    } else {
      params.append("stdin", btoa(unescape(encodeURIComponent(stdin))));
      params.append("expected", btoa(unescape(encodeURIComponent(expected))));
    }

    chrome.tabs.create({ url: `${JUDGE_BASE_URL}/?${params.toString()}` });
    sendResponse({ ok: true });
  } else if (request.action === "submitToPlatform") {
    const { code, language, problemUrl } = request;
    if (problemUrl) {
      // Store code in chrome.storage.local to keep the URL short.
      // Long URLs with base64-encoded code cause Cloudflare Turnstile Error 600010.
      chrome.storage.local.set({ 
        codeArena_pendingSubmit: { code, language } 
      }, () => {
        const submitUrl = new URL(problemUrl);
        submitUrl.searchParams.set("judge_action", "auto_submit");
        chrome.tabs.create({ url: submitUrl.toString() });
      });
    }
  } else if (request.action === "injectMainWorld") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: "MAIN",
      func: (injectedCode) => {
        try {
          const cm = document.querySelector('.CodeMirror')?.CodeMirror;
          if (cm) {
            cm.setValue(injectedCode);
          } else if (typeof editor !== 'undefined' && editor && editor.setValue) {
            editor.setValue(injectedCode);
          } else if (typeof sourceCode !== 'undefined' && sourceCode && sourceCode.setValue) {
            sourceCode.setValue(injectedCode);
          }
        } catch(e) {}
        
        try {
          const monacoModels = window.monaco?.editor?.getModels();
          if (monacoModels && monacoModels.length > 0) {
            monacoModels[0].setValue(injectedCode);
          } else {
             const aceEl = document.querySelector('.ace_editor');
             if (aceEl && window.ace) {
                window.ace.edit(aceEl).setValue(injectedCode);
             }
          }
        } catch(e) {}
        
        try {
          const textareas = document.querySelectorAll('textarea');
          for (let ta of textareas) {
            if (ta.className.includes('monaco') || ta.closest('.monaco-editor') || ta.name === 'sourceCode') {
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(ta, injectedCode);
              } else {
                ta.value = injectedCode;
              }
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        } catch(e) {}
      },
      args: [request.code]
    });
    sendResponse({ ok: true });
  } else if (request.action === "waitTurnstileAndSubmit") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: "MAIN",
      func: () => {
        console.log("[CodeArena MAIN] Starting Turnstile interception...");
        
        function doSubmit() {
          setTimeout(() => {
            const sBtn = document.querySelector('#submit') 
              || document.querySelector('button#submit')
              || document.querySelector('#btn-submit')
              || document.querySelector('form button[type="submit"]')
              || document.querySelector('button[type="submit"].btn-primary');
            
            if (sBtn) {
              console.log("[CodeArena MAIN] Clicking submit:", sBtn.textContent.trim());
              sBtn.disabled = false;
              sBtn.click();
            } else {
              console.log("[CodeArena MAIN] Trying form.submit()");
              const form = document.querySelector('form');
              if (form) form.submit();
            }
          }, 300);
        }
        
        let submitted = false;
        function onTurnstileSolved(token) {
          if (submitted) return;
          submitted = true;
          console.log("[CodeArena MAIN] TURNSTILE SOLVED! Token length: " + (token ? token.length : 0));
          doSubmit();
        }
        
        // METHOD 1: Intercept the hidden input value setter using Object.defineProperty
        const originalSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        const originalGetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get;
        
        const allTurnstileInputs = document.querySelectorAll('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]');
        console.log("[CodeArena MAIN] Found " + allTurnstileInputs.length + " turnstile input(s) to intercept");
        
        allTurnstileInputs.forEach((inp, i) => {
          Object.defineProperty(inp, 'value', {
            set: function(val) {
              console.log("[CodeArena MAIN] Input " + i + " value SET! Length: " + (val ? val.length : 0));
              originalSetter.call(this, val);
              if (val && val.trim() !== "") {
                onTurnstileSolved(val);
              }
            },
            get: function() {
              return originalGetter.call(this);
            },
            configurable: true
          });
        });
        
        // METHOD 2: Watch for NEW inputs being added via MutationObserver
        const observer = new MutationObserver((mutations) => {
          for (const mut of mutations) {
            for (const node of mut.addedNodes) {
              if (node.nodeType !== 1) continue;
              const newInputs = node.matches && node.matches('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]') 
                ? [node] 
                : Array.from(node.querySelectorAll ? node.querySelectorAll('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]') : []);
              for (const newInp of newInputs) {
                console.log("[CodeArena MAIN] New turnstile input detected!");
                if (newInp.value && newInp.value.trim() !== "") {
                  onTurnstileSolved(newInp.value);
                }
                // Also intercept its setter
                Object.defineProperty(newInp, 'value', {
                  set: function(val) {
                    originalSetter.call(this, val);
                    if (val && val.trim() !== "") onTurnstileSolved(val);
                  },
                  get: function() { return originalGetter.call(this); },
                  configurable: true
                });
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        
        // METHOD 3: Fallback polling with ALL possible detection
        let pollCount = 0;
        const interval = setInterval(() => {
          if (submitted) { clearInterval(interval); return; }
          pollCount++;
          
          // Try turnstile API with widget container
          try {
            if (window.turnstile) {
              // Try without args
              let resp = window.turnstile.getResponse();
              if (!resp) {
                // Try with widget container
                const container = document.querySelector('[data-sitekey]');
                if (container) resp = window.turnstile.getResponse(container);
              }
              if (resp) { onTurnstileSolved(resp); return; }
            }
          } catch(e) {}
          
          // Check all inputs using native getter (bypasses our defineProperty)
          const inputs = document.querySelectorAll('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]');
          for (const inp of inputs) {
            const val = originalGetter.call(inp);
            if (val && val.trim() !== "") { onTurnstileSolved(val); return; }
          }
          
          // Check data-response attribute
          const widget = document.querySelector('[data-sitekey]');
          if (widget) {
            const dr = widget.getAttribute('data-response');
            if (dr) { onTurnstileSolved(dr); return; }
          }
          
          // No turnstile at all? Submit after 3 seconds
          if (inputs.length === 0 && !window.turnstile && pollCount >= 6) {
            console.log("[CodeArena MAIN] No Turnstile found, submitting.");
            onTurnstileSolved("none");
            return;
          }
          
          if (pollCount % 8 === 1) {
            console.log("[CodeArena MAIN] Poll #" + pollCount + ": waiting... inputs=" + inputs.length);
          }
        }, 500);

        setTimeout(() => { clearInterval(interval); observer.disconnect(); console.log("[CodeArena MAIN] Timeout."); }, 300000);
      },
      args: []
    });
    sendResponse({ ok: true });
  }
  return true;
});
