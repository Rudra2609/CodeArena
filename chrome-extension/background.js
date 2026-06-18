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
        console.log("[CodeArena MAIN] Starting Turnstile polling in MAIN world...");
        let pollCount = 0;
        const interval = setInterval(() => {
          pollCount++;
          const shouldLog = pollCount % 4 === 1;
          
          // Method 1: Check Turnstile JS API
          let apiResponse = null;
          try {
            if (window.turnstile) {
              apiResponse = window.turnstile.getResponse();
            }
          } catch(e) {}
          
          // Method 2: Check hidden inputs
          const inputs = document.querySelectorAll('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]');
          let inputValue = null;
          for (const inp of inputs) {
            if (inp.value && inp.value.trim() !== "") {
              inputValue = inp.value;
              break;
            }
          }
          
          // Method 3: Check iframe data-state
          let iframeState = null;
          const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
          if (turnstileIframe) {
            iframeState = turnstileIframe.getAttribute('data-state');
          }
          
          // Method 4: Check .cf-turnstile data-response
          let widgetResponse = null;
          const widget = document.querySelector('[data-sitekey]');
          if (widget) {
            widgetResponse = widget.getAttribute('data-response') || widget.dataset.response;
          }
          
          if (shouldLog) {
            console.log("[CodeArena MAIN] Poll #" + pollCount + ":" +
              " inputs=" + inputs.length +
              " inputValue=" + (inputValue ? inputValue.length + " chars" : "null") +
              " apiResponse=" + (apiResponse ? apiResponse.length + " chars" : "null") +
              " iframeState=" + iframeState +
              " widgetResponse=" + (widgetResponse ? widgetResponse.length + " chars" : "null") +
              " hasTurnstileAPI=" + !!window.turnstile
            );
          }
          
          // Check if solved by ANY method
          const token = apiResponse || inputValue || widgetResponse;
          
          if (!token) {
            // No Turnstile on page at all
            if (inputs.length === 0 && !window.turnstile && !turnstileIframe && pollCount >= 6) {
              console.log("[CodeArena MAIN] No Turnstile found, proceeding.");
            } else {
              return; // Keep waiting
            }
          } else {
            console.log("[CodeArena MAIN] Turnstile SOLVED! Token length: " + token.length);
          }

          clearInterval(interval);

          // Small delay then submit
          setTimeout(() => {
            const sBtn = document.querySelector('#submit') 
              || document.querySelector('button#submit')
              || document.querySelector('#btn-submit')
              || document.querySelector('form button[type="submit"]')
              || document.querySelector('button[type="submit"].btn-primary');
            
            if (sBtn) {
              console.log("[CodeArena MAIN] Clicking submit button:", sBtn.textContent.trim());
              sBtn.disabled = false;
              sBtn.click();
            } else {
              console.log("[CodeArena MAIN] No submit button found, trying form.submit()");
              const form = document.querySelector('form');
              if (form) form.submit();
            }
          }, 300);
        }, 500);

        setTimeout(() => { clearInterval(interval); console.log("[CodeArena MAIN] Timeout."); }, 300000);
      },
      args: []
    });
    sendResponse({ ok: true });
  }
  return true;
});
