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
        { label: 'Capture  (Shift+Win+W)', click: openCapture },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', openCapture);
}

async function openCapture() {
    if (captureWindows.length > 0) return;

    const displays = screen.getAllDisplays();

    // Request at each display's physical resolution — thumbnailSize is a cap, not a target,
    // so Electron will not upscale beyond native resolution.
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

    const screenshots = displays.map((d, i) => {
        const src = sources.find(s => String(s.display_id) === String(d.id)) || sources[i] || sources[0];
        const { width: thumbW, height: thumbH } = src.thumbnail.getSize();
        return { dataUrl: src.thumbnail.toDataURL(), thumbW, thumbH };
    });

    const wins = [];

    for (let i = 0; i < displays.length; i++) {
        const d = displays[i];

        // BrowserWindow uses physical pixels on Windows; d.bounds is in logical (DIP) pixels.
        // Multiply by scaleFactor to get the correct physical size for this display.
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
            skipTaskbar: true,
            show: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        // 'screen-saver' level places our overlay above the Windows taskbar
        win.setAlwaysOnTop(true, 'screen-saver');
        win.loadFile('capture.html');
        win.on('closed', () => { captureWindows = captureWindows.filter(w => w !== win); });
        wins.push(win);
    }

    await Promise.all(wins.map(win => new Promise(resolve => {
        win.webContents.once('did-finish-load', resolve);
    })));

    for (let i = 0; i < wins.length; i++) {
        if (!wins[i].isDestroyed()) {
            wins[i].webContents.send('init-capture', screenshots[i]);
        }
    }

    await new Promise(r => setTimeout(r, 80));

    wins.forEach(w => { if (!w.isDestroyed()) w.show(); });
    if (wins[0] && !wins[0].isDestroyed()) wins[0].focus();
    captureWindows = wins;
}

function showResult(dataUrl) {
    if (resultWindow && !resultWindow.isDestroyed()) resultWindow.close();

    // Capture `win` in a local variable so the did-finish-load callback never closes over
    // the outer `resultWindow` reference, which may be nulled by a prior window's close handler.
    const win = new BrowserWindow({
        width: 500, height: 540,
        frame: true, alwaysOnTop: true, resizable: true,
        title: 'Math Solution',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    resultWindow = win;
    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
    win.on('closed', () => { if (resultWindow === win) resultWindow = null; });
    win.webContents.once('did-finish-load', () => {
        if (!win.isDestroyed()) win.webContents.send('process-screenshot', dataUrl);
    });
}

app.whenReady().then(() => {
    createTray();

    const ok = globalShortcut.register('Shift+Super+W', openCapture);
    tray.setToolTip(
        ok ? 'Math Screenshot Solver\nShift+Win+W to capture'
           : 'Math Screenshot Solver\nClick tray icon to capture'
    );
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

// OCR in main process — worker_threads work reliably here
ipcMain.handle('ocr-image', async (_, dataUrl) => {
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
        tessedit_pageseg_mode: '6',       // Assume a uniform block of text
        tessedit_char_whitelist: '',       // Allow all characters
        preserve_interword_spaces: '1',
    });
    const { data: { text } } = await worker.recognize(dataUrl);
    await worker.terminate();
    return text;
});

ipcMain.on('open-capture',  () => openCapture());
ipcMain.on('close-capture', () => closeAllCaptureWindows());

ipcMain.on('selection-captured', (_, dataUrl) => {
    closeAllCaptureWindows();
    showResult(dataUrl);
});
