const { app, BrowserWindow, globalShortcut, screen, ipcMain, Tray, Menu, desktopCapturer } = require('electron');
const path = require('path');
const Tesseract = require('tesseract.js');

let resultWindow  = null;
let captureWindows = [];
let tray = null;

app.setAppUserModelId('com.math-screenshot-solver');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else { app.on('second-instance', openCapture); }

app.on('window-all-closed', () => {});

function closeAllCaptureWindows() {
    for (const w of captureWindows) { if (!w.isDestroyed()) w.close(); }
    captureWindows = [];
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Math Screenshot Solver', enabled: false },
        { type: 'separator' },
        { label: 'Capture', click: openCapture },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', openCapture);
}

async function openCapture() {
    if (captureWindows.length > 0) return;

    const displays = screen.getAllDisplays();

    // Use each display's physical resolution as the thumbnail size cap
    const maxW = Math.max(...displays.map(d => Math.round(d.bounds.width  * d.scaleFactor)));
    const maxH = Math.max(...displays.map(d => Math.round(d.bounds.height * d.scaleFactor)));

    let sources;
    try {
        sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
    } catch (e) {
        console.error('desktopCapturer failed:', e);
        return;
    }

    // Pre-encode all screenshots before creating any windows
    const dataUrls = displays.map((d, i) => {
        const src = sources.find(s => String(s.display_id) === String(d.id)) || sources[i] || sources[0];
        return src.thumbnail.toDataURL();
    });

    const wins = [];

    for (let i = 0; i < displays.length; i++) {
        const d = displays[i];

        // One window per display, sized to that display's logical pixel bounds.
        // Per-monitor windows avoid cross-DPI rendering issues that break the overlay.
        const win = new BrowserWindow({
            x: d.bounds.x,
            y: d.bounds.y,
            width:  d.bounds.width,
            height: d.bounds.height,
            frame: false,
            transparent: false,
            backgroundColor: '#000000',
            alwaysOnTop: true,
            skipTaskbar: true,
            show: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        win.loadFile('capture.html');
        win.on('closed', () => { captureWindows = captureWindows.filter(w => w !== win); });
        wins.push(win);
    }

    // Wait for every window to finish loading HTML
    await Promise.all(wins.map(win => new Promise(resolve => {
        win.webContents.once('did-finish-load', resolve);
    })));

    // Send each window its own screenshot + scale factor
    for (let i = 0; i < wins.length; i++) {
        if (!wins[i].isDestroyed()) {
            wins[i].webContents.send('init-capture', {
                screenshotDataUrl: dataUrls[i],
                scaleFactor: displays[i].scaleFactor
            });
        }
    }

    // Brief pause so renderers can paint the screenshot before windows become visible
    await new Promise(r => setTimeout(r, 60));

    wins.forEach(w => { if (!w.isDestroyed()) w.show(); });
    if (wins[0] && !wins[0].isDestroyed()) wins[0].focus();
    captureWindows = wins;
}

function showResult(dataUrl) {
    if (resultWindow) resultWindow.close();

    resultWindow = new BrowserWindow({
        width: 500, height: 540,
        frame: true, alwaysOnTop: true, resizable: true,
        title: 'Math Solution',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: { nodeIntegration: true, contextIsolation: false }
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

    const ok1 = globalShortcut.register('Shift+Super+W', openCapture);
    // Ctrl+Shift+Z as fallback for Bluetooth keyboards where Win key doesn't reach Electron
    const ok2 = ok1 ? false : globalShortcut.register('CommandOrControl+Shift+Z', openCapture);

    tray.setToolTip(
        ok1 ? 'Math Screenshot Solver\nShift+Win+W to capture'
            : ok2 ? 'Math Screenshot Solver\nCtrl+Shift+Z to capture'
                  : 'Math Screenshot Solver\nClick tray icon to capture'
    );
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

// OCR runs in main process — renderer worker_threads are unreliable in Electron
ipcMain.handle('ocr-image', async (_, dataUrl) => {
    const result = await Tesseract.recognize(dataUrl, 'eng');
    return result.data.text;
});

ipcMain.on('open-capture',  () => openCapture());
ipcMain.on('close-capture', () => closeAllCaptureWindows());

// Renderer crops the image itself and sends back a ready data URL
ipcMain.on('selection-captured', (_, dataUrl) => {
    closeAllCaptureWindows();
    showResult(dataUrl);
});
