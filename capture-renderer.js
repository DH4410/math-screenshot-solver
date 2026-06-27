const { ipcRenderer } = require('electron');

let screenshotDataUrl = null;
let scaleX = 1, scaleY = 1;
let isDrawing = false;
let startX, startY;

const bg      = document.getElementById('bg');
const dim     = document.getElementById('dim');
const sel     = document.getElementById('sel');
const sizeTag = document.getElementById('size');
const toolbar = document.getElementById('toolbar');

ipcRenderer.on('init-capture', (_, { dataUrl, thumbW, thumbH }) => {
    screenshotDataUrl = dataUrl;
    // Map CSS pixels (this window) → thumbnail pixels (full native screenshot).
    scaleX = thumbW / window.innerWidth;
    scaleY = thumbH / window.innerHeight;
    bg.style.backgroundImage = `url("${dataUrl}")`;
});

document.getElementById('cancelBtn').addEventListener('click', () => ipcRenderer.send('close-capture'));
document.getElementById('fullBtn').addEventListener('click', () => {
    // Capture this entire monitor — the snipping-tool "full screen" snip.
    captureRegion(0, 0, window.innerWidth, window.innerHeight);
});

document.addEventListener('mousedown', (e) => {
    if (!screenshotDataUrl) return;
    if (toolbar.contains(e.target)) return;   // clicks on the toolbar are not a drag
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    dim.style.display     = 'none';
    toolbar.style.display = 'none';
    sel.style.cssText = `display:block;left:${startX}px;top:${startY}px;width:0;height:0`;
});

document.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    const l = Math.min(e.clientX, startX),  t = Math.min(e.clientY, startY);
    sel.style.left = l + 'px';  sel.style.top    = t + 'px';
    sel.style.width = w + 'px'; sel.style.height = h + 'px';

    // Live pixel dimensions, positioned just above (or below) the selection.
    sizeTag.textContent = `${Math.round(w * scaleX)} × ${Math.round(h * scaleY)}`;
    sizeTag.style.display = 'block';
    sizeTag.style.left = l + 'px';
    sizeTag.style.top  = (t > 28 ? t - 24 : t + h + 6) + 'px';
});

document.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    sizeTag.style.display = 'none';

    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    const l = Math.min(e.clientX, startX),  t = Math.min(e.clientY, startY);

    if (w < 5 || h < 5) { ipcRenderer.send('close-capture'); return; }
    captureRegion(l, t, w, h);
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ipcRenderer.send('close-capture');
});

// Crop a CSS-pixel region out of the native screenshot, preprocess it, and send it for OCR.
function captureRegion(l, t, w, h) {
    if (!screenshotDataUrl) return;
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
}

// Otsu's method: pick the gray level that best separates text from background.
function otsuThreshold(hist, total) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
    for (let i = 0; i < 256; i++) {
        wB += hist[i];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += i * hist[i];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > maxVar) { maxVar = between; threshold = i; }
    }
    return threshold;
}

// Preprocess the cropped image for better Tesseract accuracy:
// 1. Upscale to ≥ 320px tall  (Tesseract prefers ~300 dpi; screens are ~96 dpi)
// 2. Convert to grayscale
// 3. Auto-levels: stretch histogram to 0–255 so text is always high-contrast
// 4. If background is dark, invert so text is dark-on-light (Tesseract reads this better)
// 5. Binarize at the Otsu threshold — clean black-on-white text reads most reliably
function preprocessForOCR(src) {
    const TARGET_H = 320;
    const scale = src.height < TARGET_H ? Math.ceil(TARGET_H / src.height) : 1;

    const c = document.createElement('canvas');
    c.width  = src.width  * scale;
    c.height = src.height * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = scale > 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);

    const id = ctx.getImageData(0, 0, c.width, c.height);
    const px = id.data;
    const n  = c.width * c.height;

    // Grayscale + histogram
    const gray = new Uint8Array(n);
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
        gray[p] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    }

    // Auto-levels: find min/max for histogram stretch
    let lo = 255, hi = 0;
    for (const v of gray) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const range = hi - lo || 1;

    // Detect dark background (median pixel < 128 → invert for Tesseract)
    const sorted = gray.slice().sort();
    const invert = sorted[n >> 1] < 128;

    // Stretch (+ optional invert), building the histogram of the result for Otsu
    const stretched = new Uint8Array(n);
    const sHist = new Uint32Array(256);
    for (let p = 0; p < n; p++) {
        let v = Math.round((gray[p] - lo) * 255 / range);
        if (invert) v = 255 - v;
        stretched[p] = v;
        sHist[v]++;
    }

    const th = otsuThreshold(sHist, n);
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
        const v = stretched[p] >= th ? 255 : 0;
        px[i] = px[i + 1] = px[i + 2] = v;
    }

    ctx.putImageData(id, 0, 0);
    return c;
}
