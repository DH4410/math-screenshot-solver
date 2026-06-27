const { ipcRenderer, clipboard } = require('electron');
const math = require('mathjs');

let currentAnswer = null;

const el = {
    detectedSection: document.getElementById('detectedSection'),
    detectedText:    document.getElementById('detectedText'),
    solutionSection: document.getElementById('solutionSection'),
    solutionText:    document.getElementById('solutionText'),
    captureBtn:      document.getElementById('captureBtn'),
    copyBtn:         document.getElementById('copyBtn'),
    closeBtn:        document.getElementById('closeBtn'),
    statusLine:      document.getElementById('statusLine'),
};

el.captureBtn.addEventListener('click', () => ipcRenderer.send('open-capture'));
el.closeBtn.addEventListener('click', () => window.close());
el.copyBtn.addEventListener('click', copyAnswer);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
    if (e.ctrlKey && e.key === 'c' && currentAnswer && !el.copyBtn.disabled) {
        e.preventDefault();
        copyAnswer();
    }
});

function copyAnswer() {
    if (!currentAnswer) return;
    clipboard.writeText(currentAnswer);
    const orig = el.copyBtn.textContent;
    el.copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { el.copyBtn.textContent = orig; }, 2000);
}

ipcRenderer.on('process-screenshot', async (_, dataUrl) => {
    currentAnswer = null;
    el.copyBtn.disabled = true;
    el.detectedSection.classList.add('hidden');
    el.solutionText.className = 'text loading';
    el.solutionText.textContent = 'Reading…';
    el.statusLine.textContent = 'Processing';

    try {
        const candidates = await performOCR(dataUrl);

        if (!candidates || candidates.length === 0) {
            el.solutionText.className = 'text error';
            el.solutionText.textContent = 'No text detected. Try a larger or clearer selection.';
            el.statusLine.textContent = 'No text found';
            return;
        }

        el.solutionText.className = 'text loading';
        el.solutionText.textContent = 'Solving…';

        // Cross-check the OCR passes: prefer whichever reading parses to a real solution,
        // breaking ties by Tesseract confidence. Fall back to the highest-confidence reading.
        const ordered = candidates.slice().sort((a, b) => b.confidence - a.confidence);
        let chosen = ordered[0], output = null;
        for (const c of ordered) {
            const sol = solveFromText(c.text);
            if (sol) { chosen = c; output = sol; break; }
        }

        el.detectedSection.classList.remove('hidden');
        el.detectedText.textContent = chosen.text;

        if (!output) {
            el.solutionText.className = 'text';
            el.solutionText.textContent = 'No math expression found.';
            el.statusLine.textContent = 'Done';
            return;
        }

        currentAnswer = output;
        el.solutionText.className = 'text';
        el.solutionText.textContent = output;
        el.copyBtn.disabled = false;
        el.statusLine.textContent = 'Done';

    } catch (err) {
        console.error(err);
        el.solutionText.className = 'text error';
        el.solutionText.textContent = `Error: ${err.message}`;
        el.statusLine.textContent = 'Error';
    }
});

async function performOCR(imageData) {
    // OCR runs in the main process (worker_threads work there, not in renderer).
    // Returns an array of { text, confidence } candidates from several OCR passes.
    return await ipcRenderer.invoke('ocr-image', imageData);
}

function normalizeExpr(str) {
    return str
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/²/g, '^2')
        .replace(/³/g, '^3')
        .replace(/(\d)\s+(\d)/g, '$1$2')
        .replace(/(\d)([a-zA-Z])/g, '$1*$2')
        .replace(/([a-zA-Z])(\d)/g, '$1*$2')
        .trim();
}

function solveEquation(lhsRaw, rhsRaw) {
    const lhs = normalizeExpr(lhsRaw);
    const rhs = normalizeExpr(rhsRaw);

    const varMatch = (lhs + rhs).match(/[a-df-zA-Z]/);   // any letter except 'e' (Euler's number)
    if (!varMatch) {
        try {
            const l = math.evaluate(lhs);
            const r = math.evaluate(rhs);
            const equal = Math.abs(l - r) < 1e-9;
            return `${math.format(l, { precision: 10 })} = ${math.format(r, { precision: 10 })}  →  ${equal ? '✓ True' : '✗ False'}`;
        } catch (_) { return null; }
    }

    const v = varMatch[0];
    const roots = findRoots(lhs, rhs, v);
    if (!roots.length) return null;
    return roots.map(r => `${v} = ${r}`).join('   or   ');
}

// Find the real roots of (lhs - rhs) = 0 for variable v by sweeping the range for sign
// changes and refining each bracket. Unlike a single bisection this catches quadratics
// (x^2 = 9 → ±3) and multiple roots. Expressions are compiled once so the sweep stays fast,
// and candidate roots are re-checked so poles/asymptotes aren't reported as solutions.
function findRoots(lhs, rhs, v) {
    let lc, rc;
    try { lc = math.compile(lhs); rc = math.compile(rhs); } catch (_) { return []; }
    const f = (x) => lc.evaluate({ [v]: x }) - rc.evaluate({ [v]: x });

    const LO = -1000, HI = 1000, STEPS = 2000;
    const roots = [];
    const addRoot = (x) => {
        let fx; try { fx = f(x); } catch (_) { return; }
        if (!Number.isFinite(fx) || Math.abs(fx) > 1e-3) return;   // reject poles/asymptotes
        const r = parseFloat(x.toPrecision(10));
        const disp = Number.isInteger(r) ? r : parseFloat(r.toFixed(6));
        if (!roots.some(e => Math.abs(e - disp) < 1e-4)) roots.push(disp);
    };

    let prevX = LO, prevY; try { prevY = f(LO); } catch (_) { prevY = NaN; }
    for (let i = 1; i <= STEPS; i++) {
        const x = LO + (HI - LO) * i / STEPS;
        let y; try { y = f(x); } catch (_) { y = NaN; }
        if (Number.isFinite(prevY) && Number.isFinite(y)) {
            if (prevY === 0) addRoot(prevX);
            else if (Math.sign(prevY) !== Math.sign(y) && y !== 0) {
                let a = prevX, b = x, fa = prevY;
                for (let k = 0; k < 80; k++) {
                    const m = (a + b) / 2, fm = f(m);
                    if (fm === 0 || Math.abs(b - a) < 1e-12) { a = b = m; break; }
                    if (Math.sign(fa) !== Math.sign(fm)) b = m; else { a = m; fa = fm; }
                }
                addRoot((a + b) / 2);
            }
        }
        prevX = x; prevY = y;
    }
    if (Number.isFinite(prevY) && prevY === 0) addRoot(prevX);
    return roots;
}

function solveFromText(text) {
    const seen = new Set();
    const results = [];

    for (const line of text.split('\n').map(l => l.trim()).filter(l => l.length > 1)) {
        if (!/[\d\+\-\*\/\^=]/.test(line)) continue;
        const key = line.replace(/\s+/g, '');
        if (seen.has(key)) continue;
        seen.add(key);

        if (line.includes('=')) {
            const idx = line.indexOf('=');
            const solved = solveEquation(line.slice(0, idx), line.slice(idx + 1));
            if (solved) results.push(`${line}\n  → ${solved}`);
        } else {
            const norm = normalizeExpr(line);
            if (/[a-df-zA-Z]/.test(norm)) continue;
            try {
                const val = math.evaluate(norm);
                if (typeof val === 'number' || val?.isComplex) {
                    results.push(`${line} = ${math.format(val, { precision: 10 })}`);
                }
            } catch (_) {}
        }
    }

    return results.length ? results.join('\n\n') : null;
}
