// background.js — handles download requests from content script

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadImages") {
    const urls = message.urls;
    let completed = 0;
    let failed = 0;

    urls.forEach((url, index) => {
      // Extract a filename from the URL
      let filename = "image_" + (index + 1);
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/");
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.includes(".")) {
          filename = lastPart;
        } else {
          // Try to guess extension from URL
          const ext = guessExtension(url);
          filename = filename + ext;
        }
      } catch (e) {
        filename = filename + ".jpg";
      }

      // Sanitize filename
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

      chrome.downloads.download(
        {
          url: url,
          filename: "ImageGrabber/" + filename,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            failed++;
          } else {
            completed++;
          }
          if (completed + failed === urls.length) {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "downloadComplete",
              completed,
              failed,
            });
          }
        }
      );
    });

    sendResponse({ status: "started", count: urls.length });
    return true; // keep channel open for async
  }

  if (message.action === "activateGrabber") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggleGrabber" });
      }
    });
    sendResponse({ status: "ok" });
    return true;
  }
});

function guessExtension(url) {
  const lower = url.toLowerCase();
  if (lower.includes(".png") || lower.includes("format=png")) return ".png";
  if (lower.includes(".gif") || lower.includes("format=gif")) return ".gif";
  if (lower.includes(".webp") || lower.includes("format=webp")) return ".webp";
  if (lower.includes(".svg")) return ".svg";
  if (lower.includes(".avif")) return ".avif";
  return ".jpg";
}
