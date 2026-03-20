// content.js — Image Grabber content script
(() => {
  // Prevent double-injection
  if (window.__imageGrabberActive !== undefined) {
    // If already loaded, just toggle
    toggleGrabber();
    return;
  }

  window.__imageGrabberActive = false;

  const MIN_WIDTH = 80;
  const MIN_HEIGHT = 80;

  let selectedImages = new Set();
  let allImages = [];
  let sizeFilter = "all"; // all | large | medium

  // ---- Listen for toggle from popup/background ----
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggleGrabber") toggleGrabber();
    if (msg.action === "downloadComplete") {
      showToast(
        `✅ Downloaded ${msg.completed} image${msg.completed !== 1 ? "s" : ""}` +
          (msg.failed > 0 ? ` (${msg.failed} failed)` : "")
      );
      deactivate();
    }
  });

  function toggleGrabber() {
    if (window.__imageGrabberActive) {
      deactivate();
    } else {
      activate();
    }
  }

  // ---- Activate ----
  function activate() {
    window.__imageGrabberActive = true;
    selectedImages.clear();
    sizeFilter = "all";
    scanImages();
    createToolbar();
    updateToolbar();
  }

  // ---- Deactivate ----
  function deactivate() {
    window.__imageGrabberActive = false;
    selectedImages.clear();

    // Remove outlines and badges
    document.querySelectorAll(".ig-selectable").forEach((img) => {
      img.classList.remove("ig-selectable", "ig-selected");
      img.removeEventListener("click", onImageClick);
    });
    document.querySelectorAll(".ig-check-badge, .ig-index-badge, .ig-size-badge").forEach((el) => el.remove());

    // Remove toolbar
    const toolbar = document.getElementById("ig-toolbar");
    if (toolbar) {
      toolbar.classList.remove("ig-visible");
      setTimeout(() => toolbar.remove(), 400);
    }

    allImages = [];
  }

  // ---- Scan page for images ----
  function scanImages() {
    allImages = [];
    const imgs = document.querySelectorAll("img");

    imgs.forEach((img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:image/svg") || src.startsWith("data:image/gif;base64,R0lGODlhAQAB")) return;

      const rect = img.getBoundingClientRect();
      const w = img.naturalWidth || rect.width;
      const h = img.naturalHeight || rect.height;

      if (w < MIN_WIDTH && h < MIN_HEIGHT) return;

      allImages.push({ el: img, src, w, h });
    });

    // Also scan background images
    const allEls = document.querySelectorAll("*");
    allEls.forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && bg.startsWith('url("http')) {
        const url = bg.slice(5, -2);
        const rect = el.getBoundingClientRect();
        if (rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT) {
          allImages.push({ el, src: url, w: rect.width, h: rect.height, isBg: true });
        }
      }
    });

    applyFilter();
  }

  function applyFilter() {
    // Remove previous decorations
    document.querySelectorAll(".ig-selectable").forEach((img) => {
      img.classList.remove("ig-selectable", "ig-selected");
      img.removeEventListener("click", onImageClick);
    });
    document.querySelectorAll(".ig-check-badge, .ig-index-badge, .ig-size-badge").forEach((el) => el.remove());

    const filtered = allImages.filter((item) => {
      if (sizeFilter === "large") return item.w >= 400 && item.h >= 400;
      if (sizeFilter === "medium") return item.w >= 150 && item.h >= 150;
      return true;
    });

    filtered.forEach((item) => {
      const el = item.el;
      // Make parent relative if needed for badge positioning
      const parent = el.parentElement;
      if (parent && getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }

      el.classList.add("ig-selectable");
      if (selectedImages.has(item.src)) {
        el.classList.add("ig-selected");
        addCheckBadge(el);
      }

      // Size badge
      const sizeBadge = document.createElement("span");
      sizeBadge.className = "ig-size-badge";
      sizeBadge.textContent = `${Math.round(item.w)}×${Math.round(item.h)}`;
      (parent || el).appendChild(sizeBadge);

      el.addEventListener("click", onImageClick);
    });
  }

  // ---- Image click handler ----
  function onImageClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const img = e.currentTarget;
    const src = img.currentSrc || img.src || extractBgUrl(img);

    if (!src) return;

    if (selectedImages.has(src)) {
      selectedImages.delete(src);
      img.classList.remove("ig-selected");
      // Remove check badge
      const badge = img.parentElement?.querySelector(".ig-check-badge");
      if (badge) badge.remove();
    } else {
      selectedImages.add(src);
      img.classList.add("ig-selected");
      addCheckBadge(img);
    }

    updateToolbar();
  }

  function extractBgUrl(el) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none" && bg.startsWith('url("')) {
      return bg.slice(5, -2);
    }
    return null;
  }

  function addCheckBadge(el) {
    // Remove existing
    const existing = el.parentElement?.querySelector(".ig-check-badge");
    if (existing) existing.remove();

    const badge = document.createElement("span");
    badge.className = "ig-check-badge";
    badge.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
    (el.parentElement || el).appendChild(badge);
  }

  // ---- Toolbar ----
  function createToolbar() {
    if (document.getElementById("ig-toolbar")) return;

    const bar = document.createElement("div");
    bar.id = "ig-toolbar";
    bar.innerHTML = `
      <span class="ig-label">🖼️ Image Grabber</span>
      <div class="ig-divider"></div>
      <div id="ig-filter-bar">
        <button class="ig-filter-active" data-filter="all">All</button>
        <button data-filter="medium">≥150px</button>
        <button data-filter="large">≥400px</button>
      </div>
      <div class="ig-divider"></div>
      <span class="ig-count" id="ig-sel-count">0</span>
      <span class="ig-label">selected</span>
      <button class="ig-btn-select-all" id="ig-btn-selall">Select All</button>
      <button class="ig-btn-download" id="ig-btn-dl" disabled>
        ↓ Download
      </button>
      <button class="ig-btn-close" id="ig-btn-close" title="Close">✕</button>
    `;
    document.body.appendChild(bar);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => bar.classList.add("ig-visible"));
    });

    // Event: download
    document.getElementById("ig-btn-dl").addEventListener("click", () => {
      if (selectedImages.size === 0) return;
      chrome.runtime.sendMessage(
        { action: "downloadImages", urls: [...selectedImages] },
        (resp) => {
          if (resp?.status === "started") {
            showToast(`⬇️ Downloading ${resp.count} image${resp.count !== 1 ? "s" : ""}…`);
          }
        }
      );
    });

    // Event: select all
    document.getElementById("ig-btn-selall").addEventListener("click", () => {
      const selectableEls = document.querySelectorAll(".ig-selectable");
      const allSelected = selectedImages.size >= selectableEls.length && selectableEls.length > 0;

      if (allSelected) {
        // Deselect all
        selectedImages.clear();
        selectableEls.forEach((el) => {
          el.classList.remove("ig-selected");
        });
        document.querySelectorAll(".ig-check-badge").forEach((b) => b.remove());
        document.getElementById("ig-btn-selall").textContent = "Select All";
      } else {
        // Select all
        selectableEls.forEach((el) => {
          const src = el.currentSrc || el.src || extractBgUrl(el);
          if (src) {
            selectedImages.add(src);
            el.classList.add("ig-selected");
            addCheckBadge(el);
          }
        });
        document.getElementById("ig-btn-selall").textContent = "Deselect All";
      }
      updateToolbar();
    });

    // Event: close
    document.getElementById("ig-btn-close").addEventListener("click", deactivate);

    // Event: filters
    document.getElementById("ig-filter-bar").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      sizeFilter = btn.dataset.filter;
      document.querySelectorAll("#ig-filter-bar button").forEach((b) => b.classList.remove("ig-filter-active"));
      btn.classList.add("ig-filter-active");
      applyFilter();
      updateToolbar();
    });
  }

  function updateToolbar() {
    const countEl = document.getElementById("ig-sel-count");
    const dlBtn = document.getElementById("ig-btn-dl");
    if (!countEl) return;

    countEl.textContent = selectedImages.size;
    dlBtn.disabled = selectedImages.size === 0;
    dlBtn.textContent = selectedImages.size > 0
      ? `↓ Download (${selectedImages.size})`
      : "↓ Download";

    // Update select all button text
    const selectableEls = document.querySelectorAll(".ig-selectable");
    const allSelected = selectedImages.size >= selectableEls.length && selectableEls.length > 0;
    const selAllBtn = document.getElementById("ig-btn-selall");
    if (selAllBtn) {
      selAllBtn.textContent = allSelected ? "Deselect All" : "Select All";
    }
  }

  // ---- Toast ----
  function showToast(message) {
    let toast = document.getElementById("ig-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ig-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("ig-visible");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("ig-visible"));
    });
    setTimeout(() => toast.classList.remove("ig-visible"), 3500);
  }
})();
