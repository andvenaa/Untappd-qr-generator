"use strict";

document.addEventListener("DOMContentLoaded", () => {

  // ── DOM refs ──────────────────────────────────────────────────────
  const form          = document.getElementById("qr-form");
  const urlInput      = document.getElementById("url-input");
  const sizeSelect    = document.getElementById("size-select");
  const marginRange   = document.getElementById("margin-range");
  const marginValue   = document.getElementById("margin-value");
  const formatRadios  = document.querySelectorAll('input[name="format"]');
  const generateBtn   = document.getElementById("generate-btn");
  const loadingEl     = document.getElementById("loading");
  const previewImg    = document.getElementById("preview-img");
  const previewSvg    = document.getElementById("preview-svg");
  const placeholderEl = document.getElementById("placeholder");
  const downloadBtn   = document.getElementById("download-btn");
  const filenameInput = document.getElementById("filename-input");
  const copyUrlBtn    = document.getElementById("copy-url-btn");

  // ── Sanity check ──────────────────────────────────────────────────
  const nodes = {
    form, urlInput, sizeSelect, marginRange, marginValue,
    generateBtn, loadingEl, previewImg, previewSvg,
    placeholderEl, downloadBtn, filenameInput, copyUrlBtn,
  };
  let ok = true;
  for (const [name, el] of Object.entries(nodes)) {
    if (!el) { console.error(`[QR] Missing DOM element: #${name}`); ok = false; }
  }
  if (!ok) { console.error("[QR] Aborting."); return; }

  // ── State ─────────────────────────────────────────────────────────
  let currentDataUrl = null;
  let currentFormat  = "png";

  // ── UI helpers ────────────────────────────────────────────────────
  function showLoading() {
    loadingEl.style.display     = "flex";
    previewImg.style.display    = "none";
    previewSvg.style.display    = "none";
    placeholderEl.style.display = "none";
  }

  function hideLoading() {
    loadingEl.style.display = "none";
  }

  function showError(msg) {
    hideLoading();
    placeholderEl.innerHTML     = `<span class="error-text">⚠ ${msg}</span>`;
    placeholderEl.style.display = "flex";
    previewImg.style.display    = "none";
    previewSvg.style.display    = "none";
    downloadBtn.disabled        = true;
  }

  function getFormat() {
    for (const r of formatRadios) if (r.checked) return r.value;
    return "png";
  }

  // ── localStorage ──────────────────────────────────────────────────
  const LS_KEY = "untappd_qr_last_url";

  function loadSaved() {
    try { const v = localStorage.getItem(LS_KEY); if (v) urlInput.value = v; }
    catch { /* private browsing */ }
  }

  function saveUrl(url) {
    try { localStorage.setItem(LS_KEY, url); } catch { }
  }

  // ── Generate ──────────────────────────────────────────────────────
  async function generateQr() {
    const url    = urlInput.value.trim();
    const size   = parseInt(sizeSelect.value, 10);
    const margin = parseInt(marginRange.value, 10);
    const format = getFormat();

    if (!url) {
      urlInput.focus();
      urlInput.classList.add("input-error");
      return;
    }
    urlInput.classList.remove("input-error");
    saveUrl(url);
    showLoading();
    generateBtn.disabled = true;

    try {
      const res  = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url, size, margin, format }),
      });
      const json = await res.json();

      if (!json.success) { showError(json.error || "Server error."); return; }

      currentFormat  = json.format;
      currentDataUrl = json.data;

      if (json.format === "png") {
        previewSvg.style.display = "none";

        previewImg.onload = () => {
          hideLoading();
          previewImg.style.display    = "block";
          placeholderEl.style.display = "none";
          downloadBtn.disabled        = false;
        };
        previewImg.onerror = () => showError("Could not display image.");
        previewImg.src = json.data;

      } else {
        previewImg.style.display    = "none";
        previewSvg.innerHTML        = json.data;
        previewSvg.style.display    = "flex";
        placeholderEl.style.display = "none";
        hideLoading();
        downloadBtn.disabled = false;
      }

    } catch (err) {
      console.error(err);
      showError("Could not reach server.");
    } finally {
      generateBtn.disabled = false;
    }
  }

  // ── Download ──────────────────────────────────────────────────────
  function downloadQr() {
    if (!currentDataUrl) return;
    const base = (filenameInput.value.trim() || "untappd-qr")
                   .replace(/\.(png|svg)$/i, "");
    const ext  = currentFormat === "svg" ? "svg" : "png";
    const href = currentFormat === "svg"
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(currentDataUrl)}`
      : currentDataUrl;

    const a = Object.assign(document.createElement("a"),
                { href, download: `${base}.${ext}`, style: "display:none" });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Copy URL ──────────────────────────────────────────────────────
  async function copyUrl() {
    const url = urlInput.value.trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      const orig = copyUrlBtn.textContent;
      copyUrlBtn.textContent = "✓";
      setTimeout(() => { copyUrlBtn.textContent = orig; }, 1500);
    } catch { copyUrlBtn.title = "Clipboard unavailable"; }
  }

  // ── Margin label ──────────────────────────────────────────────────
  function updateMarginLabel() {
    marginValue.textContent = marginRange.value;
  }

  // ── Event wiring ──────────────────────────────────────────────────
  form.addEventListener("submit", (e) => { e.preventDefault(); generateQr(); });
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); generateQr(); }
  });
  urlInput.addEventListener("input", () => urlInput.classList.remove("input-error"));
  marginRange.addEventListener("input", updateMarginLabel);
  downloadBtn.addEventListener("click", downloadQr);
  copyUrlBtn.addEventListener("click", copyUrl);

  // ── Init ──────────────────────────────────────────────────────────
  loadSaved();
  updateMarginLabel();

}); // end DOMContentLoaded
