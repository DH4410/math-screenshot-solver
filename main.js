const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

let resultWindow = null;
let captureWindow = null;
let tray = null;

app.setAppUserModelId('com.math-screenshot-solver');

// Single instance — if a second instance launches, just open capture overlay
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        openCapture();
    });
}

// Keep app alive in the tray even when all windows are closed
app.on('window-all-closed', () => {});

function createTray() {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    tray.setToolTip('Math Screenshot Solver\nCtrl+Win+W to capture');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Math Screenshot Solver', enabled: false },
        { type: 'separator' },
        { label: 'Capture  (Ctrl+Win+W)', click: openCapture },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', openCapture);
}

function openCapture() {
    if (captureWindow) return;
    captureWindow = new BrowserWindow({
        fullscreen: true,
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

    // Ctrl+Win+W  (Super = Windows key on Windows)
    const ok = globalShortcut.register('Control+Super+W', openCapture);
    if (!ok) console.error('Could not register Ctrl+Win+W — key may be taken by the OS');
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

ipcMain.on('open-capture', openCapture);
ipcMain.on('close-capture', () => { if (captureWindow) captureWindow.close(); });
ipcMain.on('screenshot-captured', (event, dataUrl) => {
    if (captureWindow) captureWindow.close();
    showResult(dataUrl);
});
