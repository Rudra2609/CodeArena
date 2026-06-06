// Listens for messages from localhost frontend (React app)
// and forwards them to the extension background script.

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data && event.data.action === "submitToPlatform") {
    chrome.runtime.sendMessage(event.data);
  }
});
