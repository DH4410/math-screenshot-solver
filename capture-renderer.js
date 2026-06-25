const { ipcRenderer } = require('electron');

let screenshotDataUrl = null;
let scaleX = 1, scaleY = 1;
let isDrawing = false;
let startX, startY;

const bg   = document.getElementById('bg');
const dim  = document.getElementById('dim');
const hint = document.getElementById('hint');
const sel  = document.getElementById('sel');

ipcRenderer.on('init-capture', (_, { dataUrl, thumbW, thumbH }) => {
    screenshotDataUrl = dataUrl;
    scaleX = thumbW / window.innerWidth;
    scaleY = thumbH / window.innerHeight;
    bg.style.backgroundImage = `url("${dataUrl}")`;
});

document.addEventListener('mousedown', (e) => {
    if (!screenshotDataUrl) return;
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    dim.style.display  = 'none';
    hint.style.display = 'none';
    sel.style.cssText = `display:block;left:${startX}px;top:${startY}px;width:0;height:0`;
});

document.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    const l = Math.min(e.clientX, startX),  t = Math.min(e.clientY, startY);
    sel.style.left = l + 'px';  sel.style.top    = t + 'px';
    sel.style.width = w + 'px'; sel.style.height = h + 'px';
});

document.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    const l = Math.min(e.clientX, startX),  t = Math.min(e.clientY, startY);

    if (w < 5 || h < 5) { ipcRenderer.send('close-capture'); return; }

    const cx = Math.round(l * scaleX), cy = Math.round(t * scaleY);
    const cw = Math.round(w * scaleX), ch = Math.round(h * scaleY);

    const crop = document.createElement('canvas');
    crop.width = cw; crop.height = ch;

    const img = new Image();
    img.onload = () => {
        crop.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
        ipcRenderer.send('selection-captured', preprocessForOCR(crop).toDataURL('image/png'));
    };
    img.src = screenshotDataUrl;
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ipcRenderer.send('close-capture');
});

// Preprocess the cropped image for better Tesseract accuracy:
// 1. Upscale to ≥ 300px tall  (Tesseract prefers ~300 dpi; screens are ~96 dpi)
// 2. Convert to grayscale
// 3. Auto-levels: stretch histogram to 0–255 so text is always high-contrast
// 4. If background is dark, invert so text is dark-on-light (Tesseract reads this better)
function preprocessForOCR(src) {
    const TARGET_H = 300;
    const scale = src.height < TARGET_H ? Math.ceil(TARGET_H / src.height) : 1;

    const c = document.createElement('canvas');
    c.width  = src.width  * scale;
    c.height = src.height * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = scale > 1;
    ctx.drawImage(src, 0, 0, c.width, c.height);

    const id = ctx.getImageData(0, 0, c.width, c.height);
    const px = id.data;

    // Convert to grayscale
    const gray = new Uint8Array(c.width * c.height);
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
        gray[p] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    }

    // Find histogram min/max for auto-levels
    let lo = 255, hi = 0;
    for (let v of gray) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const range = hi - lo || 1;

    // Detect dark background (median pixel < 128 → invert for Tesseract)
    const sorted = gray.slice().sort();
    const median = sorted[Math.floor(sorted.length / 2)];
    const invert = median < 128;

    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
        let v = Math.round((gray[p] - lo) * 255 / range);
        if (invert) v = 255 - v;
        px[i] = px[i + 1] = px[i + 2] = v;
    }

    ctx.putImageData(id, 0, 0);
    return c;
}
