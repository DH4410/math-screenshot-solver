const { app, BrowserWindow, globalShortcut, screen, ipcMain, Tray, Menu, desktopCapturer } = require('electron');
const path = require('path');
const Tesseract = require('tesseract.js');

let resultWindow   = null;
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
        { label: 'Capture  (Shift+Win+W  or  Ctrl+Shift+Z)', click: openCapture },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', openCapture);
}

async function openCapture() {
    if (captureWindows.length > 0) return;

    const displays = screen.getAllDisplays();

    // Request thumbnails at the max physical resolution so each display gets its native quality.
    // thumbnailSize is a cap — Electron won't upscale beyond each source's native resolution.
    const maxPhysW = Math.max(...displays.map(d => Math.round(d.bounds.width  * d.scaleFactor)));
    const maxPhysH = Math.max(...displays.map(d => Math.round(d.bounds.height * d.scaleFactor)));

    let sources;
    try {
        sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: maxPhysW, height: maxPhysH }
        });
    } catch (e) {
        console.error('desktopCapturer failed:', e);
        return;
    }

    // Pre-encode screenshots and record their actual pixel dimensions before creating windows
    const screenshots = displays.map((d, i) => {
        const src = sources.find(s => String(s.display_id) === String(d.id)) || sources[i] || sources[0];
        const { width: thumbW, height: thumbH } = src.thumbnail.getSize();
        return { dataUrl: src.thumbnail.toDataURL(), thumbW, thumbH };
    });

    const wins = [];

    for (let i = 0; i < displays.length; i++) {
        const d = displays[i];

        // On Windows, BrowserWindow width/height are in PHYSICAL pixels (not logical/DIP).
        // screen.getAllDisplays() bounds are in logical pixels, so multiply by scaleFactor
        // to get the physical dimensions needed to fill the display.
        const physW = Math.round(d.bounds.width  * d.scaleFactor);
        const physH = Math.round(d.bounds.height * d.scaleFactor);

        const win = new BrowserWindow({
            x: d.bounds.x,
            y: d.bounds.y,
            width:  physW,
            height: physH,
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

    // Wait for all windows to load
    await Promise.all(wins.map(win => new Promise(resolve => {
        win.webContents.once('did-finish-load', resolve);
    })));

    // Send each window: its screenshot + actual thumb pixel dimensions for correct crop math
    for (let i = 0; i < wins.length; i++) {
        if (!wins[i].isDestroyed()) {
            wins[i].webContents.send('init-capture', screenshots[i]);
        }
    }

    // Let renderers paint the screenshot before revealing the windows
    await new Promise(r => setTimeout(r, 80));

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

    // Register both hotkeys simultaneously — Win key unreliable on some Bluetooth keyboards
    const ok1 = globalShortcut.register('Shift+Super+W',           openCapture);
    const ok2 = globalShortcut.register('CommandOrControl+Shift+Z', openCapture);

    const active = [ok1 && 'Shift+Win+W', ok2 && 'Ctrl+Shift+Z'].filter(Boolean).join('  or  ');
    tray.setToolTip(`Math Screenshot Solver\n${active || 'Click tray icon'} to capture`);
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

// OCR in main process — worker_threads work reliably here, not in Electron renderer
ipcMain.handle('ocr-image', async (_, dataUrl) => {
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
        tessedit_pageseg_mode: '6',  // treat selection as a uniform block of text
    });
    const { data: { text } } = await worker.recognize(dataUrl);
    await worker.terminate();
    return text;
});

ipcMain.on('open-capture',  () => openCapture());
ipcMain.on('close-capture', () => closeAllCaptureWindows());

// Renderer crops and preprocesses the image, then sends the final data URL here
ipcMain.on('selection-captured', (_, dataUrl) => {
    closeAllCaptureWindows();
    showResult(dataUrl);
});
