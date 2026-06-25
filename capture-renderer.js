const { ipcRenderer } = require('electron');

let screenshotDataUrl = null;
let scaleFactor = 1;
let isDrawing   = false;
let startX, startY;

const bg   = document.getElementById('bg');
const dim  = document.getElementById('dim');
const hint = document.getElementById('hint');
const sel  = document.getElementById('sel');

// Main process sends the screenshot for THIS display + its DPI scale factor
ipcRenderer.on('init-capture', (_, data) => {
    screenshotDataUrl = data.screenshotDataUrl;
    scaleFactor       = data.scaleFactor;
    bg.style.backgroundImage = `url("${data.screenshotDataUrl}")`;
});

document.addEventListener('mousedown', (e) => {
    if (!screenshotDataUrl) return;
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    dim.style.display  = 'none';  // selection shadow handles the outside-dim from here
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

    // Crop the screenshot here in the renderer.
    // Mouse coords are logical pixels; multiply by scaleFactor to get physical pixels,
    // which is the resolution of the screenshot thumbnail from desktopCapturer.
    const canvas = document.createElement('canvas');
    const cx = Math.round(l * scaleFactor), cy = Math.round(t * scaleFactor);
    const cw = Math.round(w * scaleFactor), ch = Math.round(h * scaleFactor);
    canvas.width = cw; canvas.height = ch;

    const img = new Image();
    img.onload = () => {
        canvas.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
        ipcRenderer.send('selection-captured', canvas.toDataURL('image/png'));
    };
    img.src = screenshotDataUrl;
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ipcRenderer.send('close-capture');
});
