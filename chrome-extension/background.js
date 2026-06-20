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
    
    // Add cache-busting timestamp so Chrome never uses an old cached version
    params.append("_t", Date.now().toString());

    const targetUrl = `${JUDGE_BASE_URL}/?${params.toString()}`;

    chrome.tabs.query({}, (tabs) => {
      // Chrome's tabs.query doesn't support port numbers in match patterns, so we filter manually
      const arenaTab = tabs.find(t => t.url && t.url.includes("localhost:8080"));
      
      if (arenaTab) {
        // Reuse the first found tab
        chrome.tabs.update(arenaTab.id, { url: targetUrl, active: true });
        chrome.windows.update(arenaTab.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
    
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
             
             // Fallback: Simulate pasting into the active Monaco textarea
             const activeTextarea = document.querySelector('.monaco-editor textarea, .inputarea, textarea.monaco-mouse-cursor-text');
             if (activeTextarea) {
               activeTextarea.focus();
               activeTextarea.select();
               document.execCommand('insertText', false, injectedCode);
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
        
        // Add visual indicator for the user
        let overlay = null;
        function showOverlay() {
          if (overlay || submitted) return;
          overlay = document.createElement('div');
          overlay.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#ff9800; color:#fff; padding:15px 30px; border-radius:8px; z-index:999999; font-size:18px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.3); text-align:center; pointer-events:none; animation: pulse 2s infinite;";
          overlay.innerHTML = "🤖 CodeArena Auto-Submit<br/><span style='font-size:14px; font-weight:normal;'>Please click the 'Verify you are human' checkbox below to complete submission!</span>";
          
          const style = document.createElement('style');
          style.innerHTML = "@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255,152,0, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(255,152,0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255,152,0, 0); } }";
          document.head.appendChild(style);
          
          document.body.appendChild(overlay);
        }

        function doSubmit() {
          if (submitted) return;
          submitted = true;
          if (overlay) overlay.remove();
          
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
          
          if (inputs.length > 0 || window.turnstile) {
            showOverlay(); // Show the prompt if Turnstile is detected
          }
          
          if (pollCount % 8 === 1) {
            console.log("[CodeArena MAIN] Poll #" + pollCount + ": waiting... inputs=" + inputs.length + " hasTurnstile=" + !!window.turnstile);
          }
        }, 500);

        setTimeout(() => { clearInterval(interval); console.log("[CodeArena MAIN] Timeout."); if(overlay) overlay.remove(); }, 300000);
      },
      args: []
    });
    sendResponse({ ok: true });
  }
  return true;
});
