// Injected into the target platform (e.g. Codeforces, AtCoder) when submitting

(async () => {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("judge_action");
  if (action !== "auto_submit") return;

  const code = decodeURIComponent(escape(atob(params.get("code"))));
  const language = params.get("language");
  const hostname = window.location.hostname;

  async function injectCodeIntoPage(codeStr) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "injectMainWorld", code: codeStr }, () => {
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function cleanUrl() {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete("judge_action");
    newUrl.searchParams.delete("code");
    newUrl.searchParams.delete("language");
    window.history.replaceState({}, "", newUrl.toString());
  }

  // Codeforces
  if (hostname.includes("codeforces.com")) {
    const langSelect = document.querySelector('select[name="programTypeId"]');
    const sourceTextarea = document.querySelector('textarea#sourceCodeTextarea');
    const fileInput = document.querySelector('input[name="sourceFile"]');
    const editorToggle = document.getElementById('toggleEditorCheckbox');
    const submitBtn = document.querySelector('input.submit[type="submit"], button.submit, input.submit');

    if (!langSelect || (!sourceTextarea && !fileInput) || !submitBtn) {
      alert("CodeArena: Could not find submit form on Codeforces!");
      return;
    }

    const cfLangMap = { "cpp23": "89", "cpp": "54", "python": "31", "java": "87", "javascript": "86" };
    let targetVal = cfLangMap[language];
    if (targetVal) langSelect.value = targetVal;
    if (editorToggle && editorToggle.checked) editorToggle.click();
    await new Promise(r => setTimeout(r, 100));

    if (sourceTextarea) {
      sourceTextarea.value = code;
    } else if (fileInput) {
      const ext = language.startsWith("cpp") ? "cpp" : language === "python" ? "py" : language === "java" ? "java" : "js";
      const file = new File([code], "solution." + ext, { type: "text/plain" });
      const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files;
    }
    cleanUrl();
    submitBtn.click();
  }

  // AtCoder
  else if (hostname.includes("atcoder.jp")) {
    console.log("[CodeArena] AtCoder auto-submit starting...");

    // 1. Set language
    const langSelect = document.querySelector('select[name="data.LanguageId"]');
    if (langSelect) {
      const options = Array.from(langSelect.options);
      let target = null;
      if (language.startsWith("cpp")) target = options.find(o => o.text.includes("C++"));
      else if (language === "python") target = options.find(o => o.text.includes("Python3") || o.text.includes("PyPy3"));
      else if (language === "java") target = options.find(o => o.text.includes("Java"));
      else if (language === "javascript") target = options.find(o => o.text.includes("Node.js"));
      
      if (target) {
        langSelect.value = target.value;
        langSelect.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[CodeArena] Language set to:", target.text);
      } else {
        console.log("[CodeArena] Could not find matching language option");
      }
    } else {
      console.log("[CodeArena] Language select not found");
    }

    // 2. Disable advanced editor if active
    const sourceTextarea = document.querySelector('textarea[name="sourceCode"]');
    let editorToggle = document.querySelector('.btn-toggle-editor');
    if (!editorToggle) {
       editorToggle = Array.from(document.querySelectorAll('button')).find(b => 
         b.textContent && (b.textContent.includes('Toggle Editor') || b.textContent.includes('エディタ'))
       );
    }
    
    if (editorToggle && document.querySelector('.CodeMirror')) {
      console.log("[CodeArena] CodeMirror detected, toggling editor off...");
      editorToggle.click();
      await new Promise(r => setTimeout(r, 200));
    }
    
    // 3. Inject code via background script (MAIN world)
    console.log("[CodeArena] Injecting code via background...");
    await injectCodeIntoPage(code);
    
    // 4. Also set textarea directly
    const txt = document.querySelector('textarea[name="sourceCode"]');
    if (txt) {
      txt.value = code;
      txt.dispatchEvent(new Event('input', {bubbles: true}));
      txt.dispatchEvent(new Event('change', {bubbles: true}));
      console.log("[CodeArena] Code injected into textarea, length:", code.length);
    } else {
      console.log("[CodeArena] WARNING: textarea[name=sourceCode] not found!");
    }

    // 5. Wait for Cloudflare Turnstile, then submit
    console.log("[CodeArena] Starting Turnstile polling...");
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      
      // Log every 4 ticks (every 2 seconds) to avoid spam
      const shouldLog = pollCount % 4 === 1;
      
      // Find ALL cf-turnstile-response and g-recaptcha-response inputs on the page
      const allTurnstileInputs = document.querySelectorAll('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]');
      const turnstileWidget = document.querySelector('.cf-turnstile');
      
      if (shouldLog) {
        console.log(`[CodeArena] Poll #${pollCount}: Found ${allTurnstileInputs.length} turnstile input(s), widget present: ${!!turnstileWidget}`);
        allTurnstileInputs.forEach((inp, i) => {
          console.log(`[CodeArena]   Input ${i}: name="${inp.name}", hasValue=${!!inp.value}, valueLength=${inp.value ? inp.value.length : 0}`);
        });
      }

      // Check if ANY turnstile input has a value
      let solved = false;
      if (allTurnstileInputs.length === 0 && !turnstileWidget) {
        // No Turnstile on this page at all - but wait a few seconds to be sure
        if (pollCount >= 6) {
          console.log("[CodeArena] No Turnstile found after 3 seconds, proceeding to submit.");
          solved = true;
        } else {
          return; // Keep waiting
        }
      } else {
        // Turnstile exists - check if it's been solved
        for (const inp of allTurnstileInputs) {
          if (inp.value && inp.value.trim() !== "") {
            solved = true;
            console.log(`[CodeArena] Turnstile SOLVED! Token found in input name="${inp.name}"`);
            break;
          }
        }
        if (!solved) {
          return; // Keep waiting for user to solve
        }
      }

      // SOLVED or no turnstile - submit!
      clearInterval(pollInterval);
      
      // Small delay to let AtCoder's JS process the token
      setTimeout(() => {
        // Find submit button - try multiple selectors
        const selectors = [
          '#submit',
          'button#submit',
          '#btn-submit',
          'form button[type="submit"]',
          'button[type="submit"].btn-primary',
          'button.btn-primary',
        ];
        
        let sBtn = null;
        for (const sel of selectors) {
          sBtn = document.querySelector(sel);
          if (sBtn) {
            console.log(`[CodeArena] Submit button found with selector: "${sel}", text: "${sBtn.textContent.trim()}"`);
            break;
          }
        }

        if (!sBtn) {
          // Last resort: find any button with "Submit" text
          sBtn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.trim().toLowerCase() === 'submit'
          );
          if (sBtn) {
            console.log(`[CodeArena] Submit button found by text content: "${sBtn.textContent.trim()}"`);
          }
        }

        if (sBtn) {
          cleanUrl();
          sBtn.disabled = false;
          sBtn.removeAttribute('disabled');
          console.log("[CodeArena] Clicking submit button NOW!");
          sBtn.click();
        } else {
          console.error("[CodeArena] ERROR: Could not find submit button! Trying form.submit() as fallback...");
          cleanUrl();
          const form = document.querySelector('form.form-horizontal, form[action*="submit"]');
          if (form) {
            form.submit();
          } else {
            console.error("[CodeArena] ERROR: Could not find form either!");
          }
        }
      }, 300);
    }, 500);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      console.log("[CodeArena] Polling timed out after 5 minutes.");
    }, 300000);
  }

  // CSES
  else if (hostname.includes("cses.fi")) {
    const langSelect = document.querySelector('select[name="option"]');
    const fileInput = document.querySelector('input[type="file"][name="file"]');
    const submitBtn = document.querySelector('input[type="submit"][name="submit"]');

    if (!fileInput || !submitBtn) {
      alert("CodeArena: Could not find submit form on CSES!");
      return;
    }

    if (langSelect) {
      const options = Array.from(langSelect.options);
      let target = null;
      if (language.startsWith("cpp")) target = options.find(o => o.text.includes("C++"));
      else if (language === "python") target = options.find(o => o.text.includes("Python"));
      else if (language === "java") target = options.find(o => o.text.includes("Java"));
      if (target) langSelect.value = target.value;
    }

    const ext = language.startsWith("cpp") ? "cpp" : language === "python" ? "py" : language === "java" ? "java" : "js";
    const file = new File([code], "solution." + ext, { type: "text/plain" });
    const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files;
    
    cleanUrl();
    submitBtn.click();
  }

  // CodeChef
  else if (hostname.includes("codechef.com")) {
    const pollInterval = setInterval(async () => {
      const submitBtn = document.querySelector('[id*="submit"], [class*="submit"], button');
      // Look specifically for their standard button, carefully checking textContent to avoid null errors
      const realBtn = Array.from(document.querySelectorAll("button")).find(b => {
        const text = b.textContent || "";
        return text.toLowerCase().includes("submit");
      });
      
      if (!realBtn && !submitBtn) return; // Wait until loaded

      clearInterval(pollInterval);
      
      await injectCodeIntoPage(code);
      
      await new Promise(r => setTimeout(r, 500));
      cleanUrl();
      
      // Re-query the button right before clicking, because Codechef's React SPA 
      // might have re-rendered the DOM and detached our old button reference.
      const freshRealBtn = Array.from(document.querySelectorAll("button")).find(b => {
        const text = b.textContent || "";
        return text.toLowerCase().includes("submit");
      });
      const freshSubmitBtn = document.querySelector('[id*="submit"], [class*="submit"], button');

      try {
        if (freshRealBtn) freshRealBtn.click();
        else if (freshSubmitBtn) freshSubmitBtn.click();
      } catch (err) {
        console.error("CodeArena: Failed to click submit button", err);
      }
    }, 500);
    
    setTimeout(() => clearInterval(pollInterval), 10000);
  }

})();
