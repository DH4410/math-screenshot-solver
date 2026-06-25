const { app, BrowserWindow, globalShortcut, screen, ipcMain, Tray, Menu, desktopCapturer } = require('electron');
const path = require('path');
const Tesseract = require('tesseract.js');

let resultWindow = null;
let captureWindow = null;
let tray = null;

app.setAppUserModelId('com.math-screenshot-solver');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => { openCapture(); });
}

app.on('window-all-closed', () => {});

function createTray() {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Math Screenshot Solver', enabled: false },
        { type: 'separator' },
        { label: 'Capture  (Shift+Win+W)', click: openCapture },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', openCapture);
}

function openCapture() {
    if (captureWindow) return;

    const displays = screen.getAllDisplays();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const d of displays) {
        minX = Math.min(minX, d.bounds.x);
        minY = Math.min(minY, d.bounds.y);
        maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
        maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
    }

    captureWindow = new BrowserWindow({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    captureWindow.loadFile('capture.html');
    captureWindow.on('closed', () => { captureWindow = null; });
}

function showResult(dataUrl) {
    if (resultWindow) resultWindow.close();

    resultWindow = new BrowserWindow({
        width: 500,
        height: 540,
        frame: true,
        alwaysOnTop: true,
        resizable: true,
        title: 'Math Solution',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            nodeIntegrationInWorker: true
        }
    });
    resultWindow.setMenuBarVisibility(false);
    resultWindow.loadFile('index.html');
    resultWindow.on('closed', () => { resultWindow = null; });
    resultWindow.webContents.once('did-finish-load', () => {
        resultWindow.webContents.send('process-screenshot', dataUrl);
    });
}

app.whenReady().then(() => {
    createTray();

    // Try primary hotkey (Shift+Win+W); fall back to Ctrl+Shift+Z for Bluetooth keyboards
    // that don't pass the Win key through to apps
    const ok1 = globalShortcut.register('Shift+Super+W', openCapture);
    const ok2 = globalShortcut.register('CommandOrControl+Shift+Z', openCapture);

    const tip = ok1
        ? 'Math Screenshot Solver\nShift+Win+W to capture'
        : ok2
            ? 'Math Screenshot Solver\nCtrl+Shift+Z to capture (Win key unavailable)'
            : 'Math Screenshot Solver\nClick here to capture';
    tray.setToolTip(tip);
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

// OCR runs in the main process — full Node.js supports worker_threads
ipcMain.handle('ocr-image', async (_, dataUrl) => {
    const result = await Tesseract.recognize(dataUrl, 'eng');
    return result.data.text;
});

// Capture overlay closed without selection
ipcMain.on('close-capture', () => { if (captureWindow) captureWindow.close(); });
ipcMain.on('open-capture', openCapture);

// User finished selecting a region — take screenshot, crop, show result
ipcMain.on('selection-captured', async (_, { left, top, width, height }) => {
    if (captureWindow) captureWindow.close();

    const displays = screen.getAllDisplays();

    // Find the display that contains the center of the selection
    const cx = left + width / 2;
    const cy = top + height / 2;
    let targetDisplay = displays[0];
    for (const d of displays) {
        if (cx >= d.bounds.x && cx < d.bounds.x + d.bounds.width &&
            cy >= d.bounds.y && cy < d.bounds.y + d.bounds.height) {
            targetDisplay = d;
            break;
        }
    }

    const sf = targetDisplay.scaleFactor;
    const physW = Math.round(targetDisplay.bounds.width  * sf);
    const physH = Math.round(targetDisplay.bounds.height * sf);

    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: physW, height: physH }
    });

    // Match source to display by display_id, fall back to index order
    let source = sources.find(s => String(s.display_id) === String(targetDisplay.id));
    if (!source) source = sources[displays.indexOf(targetDisplay)] || sources[0];

    // Convert selection (virtual desktop logical coords) → display-relative physical pixels
    const relLeft = left - targetDisplay.bounds.x;
    const relTop  = top  - targetDisplay.bounds.y;
    const cropX = Math.round(Math.max(0, relLeft * sf));
    const cropY = Math.round(Math.max(0, relTop  * sf));
    const cropW = Math.round(Math.min(width  * sf, physW - cropX));
    const cropH = Math.round(Math.min(height * sf, physH - cropY));

    try {
        const cropped = source.thumbnail.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
        showResult(cropped.toDataURL());
    } catch (err) {
        console.error('Crop error:', err);
        showResult(source.thumbnail.toDataURL()); // fallback: full screen
    }
});
