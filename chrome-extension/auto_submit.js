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
      chrome.runtime.sendMessage({ action: "injectMainWorld", code: codeStr }, () => {
        resolve();
      });
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
    const langSelect = document.querySelector('select[name="data.LanguageId"]');
    const sourceTextarea = document.querySelector('textarea[name="sourceCode"]');
    const submitBtn = document.querySelector('#submit, #btn-submit, button[type="submit"].btn-primary, button.btn-primary');

    if ((!sourceTextarea && !document.querySelector('.editor')) || !submitBtn) {
      alert("CodeArena: Could not find submit form on AtCoder!");
      return;
    }

    if (langSelect) {
      const options = Array.from(langSelect.options);
      let target = null;
      if (language.startsWith("cpp")) target = options.find(o => o.text.includes("C++"));
      else if (language === "python") target = options.find(o => o.text.includes("Python3") || o.text.includes("PyPy3"));
      else if (language === "java") target = options.find(o => o.text.includes("Java"));
      else if (language === "javascript") target = options.find(o => o.text.includes("Node.js"));
      
      if (target) langSelect.value = target.value;
    }

    let editorToggle = document.querySelector('.btn-toggle-editor');
    if (!editorToggle) {
       editorToggle = Array.from(document.querySelectorAll('button')).find(b => 
         b.textContent && (b.textContent.includes('Toggle Editor') || b.textContent.includes('エディタ'))
       );
    }
    
    // CodeMirror/Ace intercepts form submissions and overwrites the textarea.
    // If the plain textarea is hidden, the advanced editor is ON, so we MUST turn it off.
    if (sourceTextarea && sourceTextarea.offsetHeight === 0 && editorToggle) {
      editorToggle.click();
      await new Promise(r => setTimeout(r, 200));
    }
    
    // Also inject via background just in case
    await injectCodeIntoPage(code);
      
    const txt = document.querySelector('textarea[name="sourceCode"]');
    if (txt) {
      txt.value = code;
      txt.dispatchEvent(new Event('input', {bubbles: true}));
      txt.dispatchEvent(new Event('change', {bubbles: true}));
    }

    // Wait for Cloudflare Turnstile if present
    const pollInterval = setInterval(() => {
      const turnstile = document.querySelector('input[name="cf-turnstile-response"]');
      const sBtn = document.querySelector('#submit, #btn-submit, button[type="submit"].btn-primary, button.btn-primary');
      
      if (turnstile && !turnstile.value) {
        return; // Wait for the Cloudflare widget to show "Success!"
      }
      
      clearInterval(pollInterval);
      cleanUrl();
      if (sBtn) sBtn.click();
    }, 500);

    // Stop polling after 15 seconds to avoid an infinite loop
    setTimeout(() => clearInterval(pollInterval), 15000);
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
