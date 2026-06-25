const { ipcRenderer, desktopCapturer, screen } = require('electron');

let isDrawing = false;
let startX, startY;
let canvas, ctx;
let screenStream;

async function init() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    canvas.width = width;
    canvas.height = height;

    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width, height }
        });

        const video = document.createElement('video');
        video.style.cssText = 'position:fixed;top:-10000px;left:-10000px';
        document.body.appendChild(video);

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sources[0].id,
                    minWidth: width,
                    maxWidth: width,
                    minHeight: height,
                    maxHeight: height
                }
            }
        });

        video.srcObject = stream;
        video.play();

        video.onloadedmetadata = () => {
            ctx.drawImage(video, 0, 0, width, height);
            stream.getTracks().forEach(track => track.stop());
            video.remove();
        };
    } catch (error) {
        console.error('Error capturing screen:', error);
    }
}

const selection = document.getElementById('selection');

document.addEventListener('mousedown', (e) => {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';
    selection.style.display = 'block';
});

document.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
});

document.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    if (width < 10 || height < 10) {
        ipcRenderer.send('close-capture');
        return;
    }

    const imageData = ctx.getImageData(left, top, width, height);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    const dataUrl = tempCanvas.toDataURL('image/png');
    ipcRenderer.send('screenshot-captured', dataUrl);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ipcRenderer.send('close-capture');
    }
});

init();
