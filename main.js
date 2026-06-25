const { app, BrowserWindow, globalShortcut, screen, ipcMain, clipboard, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow;
let captureWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createCaptureWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  captureWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  captureWindow.loadFile('capture.html');

  captureWindow.on('closed', () => {
    captureWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    createCaptureWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: screen.getPrimaryDisplay().workAreaSize
  });
  return sources[0];
});

ipcMain.on('close-capture', () => {
  if (captureWindow) {
    captureWindow.close();
  }
});

ipcMain.on('screenshot-captured', (event, dataUrl) => {
  if (captureWindow) {
    captureWindow.close();
  }
  if (mainWindow) {
    mainWindow.webContents.send('process-screenshot', dataUrl);
    mainWindow.focus();
  }
});
