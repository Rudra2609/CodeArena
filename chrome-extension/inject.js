document.addEventListener("CodeArenaInject", (e) => {
  const code = e.detail;
  
  // AtCoder CodeMirror
  try {
    if (typeof editor !== 'undefined' && editor && editor.setValue) {
      editor.setValue(code);
    } else if (typeof sourceCode !== 'undefined' && sourceCode && sourceCode.setValue) {
      sourceCode.setValue(code);
    }
  } catch(err) {}

  // CodeChef Monaco / Ace
  try {
    const monacoModels = window.monaco?.editor?.getModels();
    if (monacoModels && monacoModels.length > 0) {
      monacoModels[0].setValue(code);
    } else {
       const aceEl = document.querySelector('.ace_editor');
       if (aceEl && window.ace) {
          window.ace.edit(aceEl).setValue(code);
       }
    }
  } catch(err) {}
});
