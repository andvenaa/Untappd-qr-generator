/**
 * server.js
 * Express backend for the Untappd QR Code Generator.
 *
 * Stack:
 *   - qrcode  → generates the raw QR PNG in memory
 *   - sharp   → composites the Untappd icon on top (no native build needed)
 *   - express → serves the API and the static frontend
 *
 * No canvas, no libcairo, no pkg-config required.
 */

"use strict";

const express  = require("express");
const path     = require("path");
const fs       = require("fs");
const QRCode   = require("qrcode");
const sharp    = require("sharp");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── URL validation ───────────────────────────────────────────────────────────

/**
 * Validates and normalises the raw URL string from the request body.
 *
 * @param {string} raw
 * @returns {{ valid: boolean, url: string, error?: string }}
 */
function canonicalizeUntappdUrl(parsed) {
  const host = parsed.hostname.toLowerCase();
  if (!["untappd.com", "www.untappd.com"].includes(host)) {
    return parsed.href;
  }

  const beerMatch = parsed.pathname.match(/^\/b\/[^/]+\/(\d+)(?:\/)?$/i);
  if (beerMatch) {
    return `https://untappd.com/qr/beer/${beerMatch[1]}`;
  }

  return parsed.href;
}

function validateUrl(raw) {
  if (!raw || typeof raw !== "string") {
    return { valid: false, url: "", error: "URL is required." };
  }

  let candidate = raw.trim();

  if (!candidate) {
    return { valid: false, url: "", error: "URL must not be empty." };
  }

  // Be helpful — prepend https:// if the user forgot it
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = "https://" + candidate;
  }

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        valid: false,
        url: "",
        error: "Only http and https URLs are supported.",
      };
    }
    return { valid: true, url: canonicalizeUntappdUrl(parsed) };
  } catch {
    return {
      valid: false,
      url: "",
      error: "The value you entered is not a valid URL.",
    };
  }
}

// ─── Icon resolution ──────────────────────────────────────────────────────────

/**
 * Returns the absolute path to the first icon file that actually exists,
 * or null if none is found.
 *
 * Supported names (checked in order):
 *   untappd-icon.png  →  untappd-icon.jpg  →  untappd-icon.svg
 *
 * To replace the icon just drop a new file into public/assets/ — no code
 * change required.
 *
 * @returns {string|null}
 */
function getIconPath() {
  const candidates = [
    path.join(__dirname, "public", "assets", "untappd-icon.png"),
    path.join(__dirname, "public", "assets", "untappd-icon.jpg"),
    path.join(__dirname, "public", "assets", "untappd-icon.svg"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

// ─── QR PNG generation (with icon overlay via sharp) ─────────────────────────

/**
 * Generates a QR code PNG and optionally composites the Untappd icon
 * in the centre using sharp (pure JS / pre-built binary — no canvas needed).
 *
 * Error correction level H allows up to ~30 % of the code to be obscured;
 * the icon covers ~22 %, leaving an 8 % safety margin.
 *
 * @param {string} url
 * @param {{ size?: number, margin?: number, centerImage?: boolean }} opts
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateQrPng(url, opts = {}) {
  // Clamp inputs to safe ranges
  const size   = Math.min(Math.max(parseInt(opts.size,   10) || 400, 100), 1000);
  const margin = Math.min(Math.max(parseInt(opts.margin, 10) || 2,     0),   10);
  const centerImage = opts.centerImage !== false;

  // ── Step 1: render the raw QR to a Buffer via qrcode ─────────────────────
  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "H",
    width: size,
    margin,
    color: {
      dark:  "#1a1a1a",   // near-black modules
      light: "#ffffff",   // white background
    },
  });

  // ── Step 2: check whether we have an icon to overlay ─────────────────────
  const iconPath = getIconPath();

  if (!centerImage || !iconPath) {
    // No icon — return the plain QR code
    return qrBuffer;
  }

  // ── Step 3: size calculations ─────────────────────────────────────────────
  // Logo occupies 22 % of the total width
  const logoSize    = Math.round(size * 0.22);

  // White rounded-rectangle "pillow" has 12 % padding around the logo
  const padding     = Math.round(logoSize * 0.12);
  const pillowSize  = logoSize + padding * 2;

  // Centre the pillow on the QR canvas
  const pillowLeft  = Math.round((size - pillowSize) / 2);
  const pillowTop   = Math.round((size - pillowSize) / 2);

  // Centre the logo inside the pillow
  const logoLeft    = pillowLeft + padding;
  const logoTop     = pillowTop  + padding;

  // Corner radius for the pillow (20 % of its size)
  const radius      = Math.round(pillowSize * 0.2);

  // ── Step 4: build the white rounded-rectangle SVG pillow ─────────────────
  // We draw this as an SVG so we don't need canvas at all.
  const pillowSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg"
          width="${pillowSize}" height="${pillowSize}">
       <rect
         x="1" y="1"
         width="${pillowSize - 2}" height="${pillowSize - 2}"
         rx="${radius}" ry="${radius}"
         fill="white"
         stroke="rgba(0,0,0,0.08)"
         stroke-width="2"
       />
     </svg>`
  );

  // ── Step 5: resize the icon ───────────────────────────────────────────────
  // sharp can read PNG, JPEG, and SVG natively
  const resizedIcon = await sharp(iconPath)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent background
    })
    .png()
    .toBuffer();

  // ── Step 6: composite everything together ─────────────────────────────────
  // Layer order: QR base → pillow → icon
  const result = await sharp(qrBuffer)
    .composite([
      {
        input:     pillowSvg,
        left:      pillowLeft,
        top:       pillowTop,
      },
      {
        input:     resizedIcon,
        left:      logoLeft,
        top:       logoTop,
      },
    ])
    .png()
    .toBuffer();

  return result;
}

// ─── QR SVG generation ────────────────────────────────────────────────────────

/**
 * Generates a clean vector SVG QR code string.
 *
 * The SVG format does not include the icon overlay because embedding a
 * raster image inside SVG makes the file less portable and harder to
 * edit in vector tools.  Users who need an icon can overlay it themselves
 * in Inkscape / Illustrator.
 *
 * @param {string} url
 * @param {{ margin?: number, centerImage?: boolean }} opts
 * @returns {Promise<string>} SVG markup string
 */
async function generateQrSvg(url, opts = {}) {
  const margin = Math.min(Math.max(parseInt(opts.margin, 10) || 2, 0), 10);

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin,
    color: {
      dark:  "#1a1a1a",
      light: "#ffffff",
    },
  });

  return svg;
}

// ─── API: POST /api/generate ──────────────────────────────────────────────────

/**
 * Request body (JSON):
 *   url    {string}  required — the URL to encode
 *   format {string}  "png" | "svg"  (default "png")
 *   size   {number}  output size in px, 100-1000  (default 400, PNG only)
 *   margin {number}  quiet-zone modules, 0-10  (default 2)
 *
 * Success response (JSON):
 *   { success: true, format: "png"|"svg", data: string, canonicalUrl: string }
 *
 * Error response (JSON):
 *   { success: false, error: string }
 */
app.post("/api/generate", async (req, res) => {
  try {
    const {
      url:    rawUrl,
      format  = "png",
      size    = 400,
      margin  = 2,
      centerImage = true,
    } = req.body;

    // Validate URL
    const { valid, url, error } = validateUrl(rawUrl);
    if (!valid) {
      return res.status(400).json({ success: false, error });
    }

    // Validate format
    const fmt = String(format).toLowerCase();
    if (!["png", "svg"].includes(fmt)) {
      return res.status(400).json({
        success: false,
        error: "format must be either 'png' or 'svg'.",
      });
    }

    // Generate
    if (fmt === "svg") {
      const svgString = await generateQrSvg(url, { margin });
      return res.json({
        success: true,
        format: "svg",
        data: svgString,
        canonicalUrl: url,
      });
    }

    // PNG path
    const pngBuffer = await generateQrPng(url, { size, margin, centerImage });
    const dataUrl   = `data:image/png;base64,${pngBuffer.toString("base64")}`;

    return res.json({
      success: true,
      format: "png",
      data: dataUrl,
      canonicalUrl: url,
    });

  } catch (err) {
    console.error("[/api/generate] Unexpected error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while generating QR code. Please try again.",
    });
  }
});

// ─── API: GET /api/health ─────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 → serve the SPA ─────────────────────────────────────────────────────

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Untappd QR Generator                       ║
  ║   Running at  http://localhost:${PORT}          ║
  ║   Press Ctrl+C to stop                       ║
  ╚══════════════════════════════════════════════╝
  `);
});
