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
        console.log("[CodeArena MAIN] Starting non-invasive Turnstile polling...");
        
        let submitted = false;
        function doSubmit() {
          if (submitted) return;
          submitted = true;
          console.log("[CodeArena MAIN] TURNSTILE SOLVED! Submitting...");
          
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
        
        // ONLY non-invasive polling - no DOM modifications
        let pollCount = 0;
        const interval = setInterval(() => {
          if (submitted) { clearInterval(interval); return; }
          pollCount++;
          
          // Check 1: turnstile.getResponse() API
          try {
            if (window.turnstile) {
              let resp = window.turnstile.getResponse();
              if (!resp) {
                const container = document.querySelector('[data-sitekey]');
                if (container) resp = window.turnstile.getResponse(container);
              }
              if (resp) {
                console.log("[CodeArena MAIN] Token from API, length: " + resp.length);
                doSubmit();
                return;
              }
            }
          } catch(e) {}
          
          // Check 2: Read hidden input values (non-invasive read)
          const inputs = document.querySelectorAll('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]');
          for (const inp of inputs) {
            if (inp.value && inp.value.trim() !== "") {
              console.log("[CodeArena MAIN] Token from input, length: " + inp.value.length);
              doSubmit();
              return;
            }
          }
          
          // Check 3: Look for success visual indicator in Turnstile widget
          const successIndicator = document.querySelector('[data-sitekey] [aria-label*="Success"], [data-sitekey] .success, .cf-turnstile[data-response]');
          if (successIndicator) {
            console.log("[CodeArena MAIN] Success indicator found!");
            doSubmit();
            return;
          }
          
          // Check 4: data-response attribute on widget
          const widget = document.querySelector('[data-sitekey]');
          if (widget && widget.getAttribute('data-response')) {
            console.log("[CodeArena MAIN] Token from data-response attr");
            doSubmit();
            return;
          }
          
          // No turnstile at all
          if (inputs.length === 0 && !window.turnstile && pollCount >= 6) {
            console.log("[CodeArena MAIN] No Turnstile found, submitting.");
            doSubmit();
            return;
          }
          
          if (pollCount % 8 === 1) {
            console.log("[CodeArena MAIN] Poll #" + pollCount + ": waiting... inputs=" + inputs.length + " hasTurnstile=" + !!window.turnstile);
          }
        }, 500);

        setTimeout(() => { clearInterval(interval); console.log("[CodeArena MAIN] Timeout."); }, 300000);
      },
      args: []
    });
    sendResponse({ ok: true });
  }
  return true;
});
