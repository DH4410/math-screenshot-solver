const { ipcRenderer, screen } = require('electron');

let isDrawing = false;
let startX, startY;

// Virtual desktop origin (may be negative when external monitor is to the left)
let minX = 0, minY = 0;
for (const d of screen.getAllDisplays()) {
    if (d.bounds.x < minX) minX = d.bounds.x;
    if (d.bounds.y < minY) minY = d.bounds.y;
}

const selection = document.getElementById('selection');

document.addEventListener('mousedown', (e) => {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    document.body.classList.add('selecting');
    selection.style.cssText = `display:block;left:${startX}px;top:${startY}px;width:0;height:0`;
});

document.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const w    = Math.abs(e.clientX - startX);
    const h    = Math.abs(e.clientY - startY);
    const left = Math.min(e.clientX, startX);
    const top  = Math.min(e.clientY, startY);
    selection.style.cssText = `display:block;left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
});

document.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    document.body.classList.remove('selecting');

    const w    = Math.abs(e.clientX - startX);
    const h    = Math.abs(e.clientY - startY);
    const left = Math.min(e.clientX, startX);
    const top  = Math.min(e.clientY, startY);

    if (w < 10 || h < 10) { ipcRenderer.send('close-capture'); return; }

    // Convert window-relative coords → virtual desktop coords for main process
    ipcRenderer.send('selection-captured', {
        left:   left + minX,
        top:    top  + minY,
        width:  w,
        height: h
    });
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ipcRenderer.send('close-capture');
});
