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
    // 1. Immediately set language
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
      }
    }

    // 2. Disable advanced editor if active
    const sourceTextarea = document.querySelector('textarea[name="sourceCode"]');
    let editorToggle = document.querySelector('.btn-toggle-editor, a.btn-toggle-editor');
    if (!editorToggle) {
       editorToggle = Array.from(document.querySelectorAll('button, a')).find(b => 
         b.textContent && (b.textContent.includes('Toggle Editor') || b.textContent.includes('エディタ'))
       );
    }
    
    if (sourceTextarea && sourceTextarea.offsetHeight === 0 && editorToggle) {
      editorToggle.click();
      await new Promise(r => setTimeout(r, 200));
    }
    
    // 3. Inject code
    await injectCodeIntoPage(code);
      
    if (sourceTextarea) {
      sourceTextarea.value = code;
      sourceTextarea.dispatchEvent(new Event('input', {bubbles: true}));
      sourceTextarea.dispatchEvent(new Event('change', {bubbles: true}));
    }

    // 4. Poll for Cloudflare to finish, then submit
    const pollInterval = setInterval(() => {
      const hasTurnstileScript = !!document.querySelector('script[src*="turnstile"], .cf-turnstile, iframe[src*="cloudflare"]');
      const turnstile = document.querySelector('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]');
      
      if (hasTurnstileScript) {
        if (!turnstile || !turnstile.value) {
          return; // Wait for Turnstile to inject the input AND for the user to solve it!
        }
      }

      clearInterval(pollInterval);
      cleanUrl();
      
      try {
        const sBtn = document.querySelector('#submit, #btn-submit, button[type="submit"].btn-primary, button.btn-primary');
        if (sBtn) sBtn.click();
      } catch (err) {
        console.error("CodeArena: Failed to click submit button on AtCoder", err);
      }
    }, 500);

    // Stop polling after 30 seconds
    setTimeout(() => clearInterval(pollInterval), 30000);
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
