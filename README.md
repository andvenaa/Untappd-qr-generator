# 🍺 Untappd QR Code Generator

A lightweight Node.js web app that generates scannable QR codes for
**Untappd check-in links**, with the **Untappd icon centred** in the
middle of each code.

No database. No authentication. Just paste a URL and scan.

---

## Features

- ⚡ Instant QR code generation in the browser
- 🍺 Untappd icon overlaid cleanly in the centre
- 📱 Error correction level **H** (≈ 30 %) — reliably scannable even with logo
- 🖼 Export as **PNG** (with icon) or **SVG** (clean vector)
- 🔧 Configurable size (200–1000 px) and quiet-zone margin
- 💾 Download with a custom filename
- 🔗 Copy URL button
- 🧠 Remembers your last URL in `localStorage`
- 📐 Responsive — works on desktop and mobile

---

## Requirements

- **Node.js** v16 or later
- **npm** v7 or later

---

## Installation

```bash
# 1 — Clone or download this project
git clone https://github.com/andvenaa/Untappd-qr-generator.git
cd untappd-qr

# 2 — Install dependencies
npm install
