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
        { label: 'Capture  (Alt+Shift+S)', click: openCapture },
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

    // Match each display to a screen source. display_id is unreliable on Windows, so we fall
    // back to the closest native-resolution match and never reuse a source for two displays.
    const used = new Set();
    const screenshots = displays.map(d => {
        const src = pickSource(d, sources, used);
        if (src) used.add(src.id);
        const { width: thumbW, height: thumbH } = src ? src.thumbnail.getSize() : { width: 1, height: 1 };
        return { dataUrl: src ? src.thumbnail.toDataURL() : '', thumbW, thumbH };
    });

    const wins = [];

    for (let i = 0; i < displays.length; i++) {
        const d = displays[i];

        // BrowserWindow bounds are device-independent (DIP) pixels — the same units as
        // d.bounds. Do NOT multiply by scaleFactor, or the overlay overflows HiDPI screens
        // and the drag-to-crop math goes wrong. The captured thumbnail is full native res;
        // capture-renderer rescales the selection using thumbW/thumbH vs the window size.
        const win = new BrowserWindow({
            x: d.bounds.x,
            y: d.bounds.y,
            width:  d.bounds.width,
            height: d.bounds.height,
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

// Pick the screen source that belongs to `display`. Tries the OS-provided display_id first
// (often empty/unreliable on Windows), then the unused source whose native resolution is
// closest to this display's physical size. Index-based matching is avoided because
// desktopCapturer source order does not track screen.getAllDisplays() order.
function pickSource(display, sources, used) {
    let s = sources.find(src =>
        src.display_id && String(src.display_id) === String(display.id) && !used.has(src.id));
    if (s) return s;

    const targetW = display.bounds.width  * display.scaleFactor;
    const targetH = display.bounds.height * display.scaleFactor;
    let best = null, bestScore = Infinity;
    for (const src of sources) {
        if (used.has(src.id)) continue;
        const { width, height } = src.thumbnail.getSize();
        const score = Math.abs(width - targetW) + Math.abs(height - targetH);
        if (score < bestScore) { bestScore = score; best = src; }
    }
    return best;
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

    // Alt+Shift+S: easy to reach, mirrors Snipping Tool's Win+Shift+S, and — unlike Win-key
    // combos, which Windows reserves and silently swallows — registers AND fires reliably.
    const HOTKEY = 'Alt+Shift+S';
    const ok = globalShortcut.register(HOTKEY, openCapture);
    if (!ok) console.error(`Failed to register global hotkey ${HOTKEY} (already in use?)`);
    tray.setToolTip(
        ok ? `Math Screenshot Solver\n${HOTKEY} to capture`
           : 'Math Screenshot Solver\nHotkey unavailable — click the tray icon to capture'
    );
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

function median(nums) {
    if (!nums.length) return 0;
    const s = nums.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

// Rebuild one OCR line as text, with best-effort exponent recovery: if an OCR pass reads a
// small digit raised above the baseline (or flags it as a superscript), re-insert a "^" so
// the solver sees x^2. Caveat: offline OCR often drops or misreads small superscripts
// outright, so this only helps when the raised digit was actually recognized as a digit.
function reconstructLine(line) {
    const words = line.words || [];
    const all = [];
    for (const w of words) for (const s of (w.symbols || [])) if (s.text && s.text.trim()) all.push(s);
    if (!all.length) return (line.text || '').trim();

    const medH = median(all.map(s => s.bbox.y1 - s.bbox.y0)) || 1;
    const baseBottoms = all.filter(s => (s.bbox.y1 - s.bbox.y0) >= 0.7 * medH).map(s => s.bbox.y1);
    const baseline = baseBottoms.length ? median(baseBottoms) : all[all.length - 1].bbox.y1;

    let out = '', inSup = false, firstWord = true;
    for (const w of words) {
        if (!firstWord) out += ' ';
        firstWord = false;
        for (const s of (w.symbols || [])) {
            if (!s.text || !s.text.trim()) continue;
            const h = s.bbox.y1 - s.bbox.y0;
            // A digit is an exponent if Tesseract flags it as a superscript, OR it is small
            // and sits above the text baseline (the flag is not always set).
            const raisedSmall = h <= 0.72 * medH && s.bbox.y1 <= baseline - 0.18 * medH;
            const isSup = /^[0-9]$/.test(s.text) && (s.is_superscript === true || raisedSmall);
            if (isSup && !inSup) { out += '^'; inSup = true; }
            else if (!isSup && inSup) { inSup = false; }
            out += s.text;
        }
    }
    return out.trim();
}

function blocksToText(blocks) {
    const lines = [];
    for (const b of (blocks || []))
        for (const p of (b.paragraphs || []))
            for (const l of (p.lines || [])) {
                const t = reconstructLine(l);
                if (t.trim()) lines.push(t);
            }
    return lines.join('\n');
}

// OCR in main process — worker_threads work reliably here. We run the same image through
// several page-segmentation modes and return each reading as a candidate; the renderer then
// cross-checks them by picking whichever one actually parses as valid math.
ipcMain.handle('ocr-image', async (_, dataUrl) => {
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: '',       // Allow all characters
        preserve_interword_spaces: '1',
    });

    const candidates = [];
    const seen = new Set();
    for (const psm of ['6', '7', '11']) {   // uniform block · single line · sparse text
        try {
            await worker.setParameters({ tessedit_pageseg_mode: psm });
            const { data } = await worker.recognize(dataUrl, {}, { blocks: true });
            let text = (data.blocks && data.blocks.length) ? blocksToText(data.blocks) : '';
            if (!text.trim()) text = (data.text || '').trim();
            const key = text.replace(/\s+/g, '');
            if (text.trim() && !seen.has(key)) {
                seen.add(key);
                candidates.push({ text, confidence: data.confidence || 0 });
            }
        } catch (_) { /* skip this pass */ }
    }
    await worker.terminate();
    return candidates;
});

ipcMain.on('open-capture',  () => openCapture());
ipcMain.on('close-capture', () => closeAllCaptureWindows());

ipcMain.on('selection-captured', (_, dataUrl) => {
    closeAllCaptureWindows();
    showResult(dataUrl);
});
