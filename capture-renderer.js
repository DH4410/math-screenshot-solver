const { ipcRenderer, desktopCapturer, screen } = require('electron');

let isDrawing = false;
let startX, startY;
let canvas, ctx;

async function init() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    const displays = screen.getAllDisplays();

    // Virtual desktop bounding box across all monitors
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const d of displays) {
        minX = Math.min(minX, d.bounds.x);
        minY = Math.min(minY, d.bounds.y);
        maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
        maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
    }

    const totalWidth  = maxX - minX;
    const totalHeight = maxY - minY;

    canvas.width  = totalWidth;
    canvas.height = totalHeight;

    // Get one source per screen
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 200, height: 200 } // thumbnail unused; keep small
    });

    // Draw each display onto the combined canvas at its virtual-desktop position
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];

        // Match source → display: try display_id (Electron 28+), fall back to order
        let display = displays.find(d => String(d.id) === String(source.display_id));
        if (!display) display = displays[i] || displays[0];

        const dx = display.bounds.x - minX;
        const dy = display.bounds.y - minY;
        const dw = display.bounds.width;
        const dh = display.bounds.height;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id,
                }
            }
        }).catch(err => { console.error('Screen capture error:', err); return null; });

        if (!stream) continue;

        const video = document.createElement('video');
        video.style.cssText = 'position:fixed;top:-10000px;left:-10000px';
        document.body.appendChild(video);
        video.srcObject = stream;
        video.play().catch(() => {});

        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                ctx.drawImage(video, dx, dy, dw, dh);
                stream.getTracks().forEach(t => t.stop());
                video.remove();
                resolve();
            };
            setTimeout(resolve, 2000); // safety timeout per display
        });
    }
}

const selection = document.getElementById('selection');

document.addEventListener('mousedown', (e) => {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
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

    const w    = Math.abs(e.clientX - startX);
    const h    = Math.abs(e.clientY - startY);
    const left = Math.min(e.clientX, startX);
    const top  = Math.min(e.clientY, startY);

    if (w < 10 || h < 10) { ipcRenderer.send('close-capture'); return; }

    const cropped = document.createElement('canvas');
    cropped.width  = w;
    cropped.height = h;
    cropped.getContext('2d').putImageData(ctx.getImageData(left, top, w, h), 0, 0);
    ipcRenderer.send('screenshot-captured', cropped.toDataURL('image/png'));
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ipcRenderer.send('close-capture');
});

init();
