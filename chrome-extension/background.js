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
      const submitUrl = new URL(problemUrl);
      submitUrl.searchParams.set("judge_action", "auto_submit");
      submitUrl.searchParams.set("code", btoa(unescape(encodeURIComponent(code))));
      submitUrl.searchParams.set("language", language);
      chrome.tabs.create({ url: submitUrl.toString() });
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
  }
  return true;
});
