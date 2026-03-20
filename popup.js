document.getElementById("activateBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "activateGrabber" }, () => {
    window.close();
  });
});
