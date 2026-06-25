const { ipcRenderer } = require('electron');

let screenshotDataUrl = null;
let scaleX = 1, scaleY = 1;   // thumb pixels per CSS pixel
let isDrawing = false;
let startX, startY;

const bg   = document.getElementById('bg');
const dim  = document.getElementById('dim');
const hint = document.getElementById('hint');
const sel  = document.getElementById('sel');

ipcRenderer.on('init-capture', (_, { dataUrl, thumbW, thumbH }) => {
    screenshotDataUrl = dataUrl;
    // window.innerWidth/Height = CSS pixels the window occupies on this display.
    // thumbW/H = actual pixels in the screenshot.
    // Their ratio is the correct scale for converting mouse coords → screenshot pixels.
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

    // Convert CSS pixel selection → screenshot physical pixel crop
    const cx = Math.round(l * scaleX), cy = Math.round(t * scaleY);
    const cw = Math.round(w * scaleX), ch = Math.round(h * scaleY);

    const crop = document.createElement('canvas');
    crop.width = cw; crop.height = ch;
    const cropCtx = crop.getContext('2d');

    const img = new Image();
    img.onload = () => {
        cropCtx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);

        // Upscale small crops — Tesseract needs at least ~100px height to read text reliably
        let finalCanvas = crop;
        if (ch < 120) {
            const factor = Math.ceil(120 / ch);
            finalCanvas = document.createElement('canvas');
            finalCanvas.width  = cw * factor;
            finalCanvas.height = ch * factor;
            const ctx2 = finalCanvas.getContext('2d');
            ctx2.imageSmoothingEnabled = false;
            ctx2.drawImage(crop, 0, 0, finalCanvas.width, finalCanvas.height);
        }

        ipcRenderer.send('selection-captured', finalCanvas.toDataURL('image/png'));
    };
    img.src = screenshotDataUrl;
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ipcRenderer.send('close-capture');
});
