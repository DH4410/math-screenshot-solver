const { ipcRenderer, clipboard } = require('electron');
const Tesseract = require('tesseract.js');
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
    el.solutionText.className = 'loading';
    el.solutionText.textContent = 'Detecting text…';

    try {
        const ocrText = await performOCR(dataUrl);

        if (!ocrText || ocrText.trim().length === 0) {
            el.solutionText.className = 'error';
            el.solutionText.textContent = 'No text detected. Try capturing a clearer area.';
            return;
        }

        el.detectedSection.classList.remove('hidden');
        el.detectedText.textContent = ocrText;
        el.solutionText.className = 'loading';
        el.solutionText.textContent = 'Solving…';

        const output = solveFromText(ocrText);
        if (!output) {
            el.solutionText.className = '';
            el.solutionText.textContent = 'No math expressions detected in this screenshot.';
            return;
        }

        currentAnswer = output;
        el.solutionText.className = '';
        el.solutionText.textContent = output;
        el.copyBtn.disabled = false;

    } catch (err) {
        console.error(err);
        el.solutionText.className = 'error';
        el.solutionText.textContent = `Error: ${err.message}`;
    }
});

async function performOCR(imageData) {
    const result = await Tesseract.recognize(imageData, 'eng', {
        logger: info => {
            if (info.status === 'recognizing text') {
                const pct = Math.round(info.progress * 100);
                el.solutionText.textContent = `Detecting text… ${pct}%`;
            }
        }
    });
    return result.data.text;
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

    const varMatch = (lhs + rhs).match(/[a-df-wyzA-Z]/);
    if (!varMatch) {
        try {
            const l = math.evaluate(lhs);
            const r = math.evaluate(rhs);
            const equal = Math.abs(l - r) < 1e-9;
            return `${math.format(l, { precision: 10 })} = ${math.format(r, { precision: 10 })}  →  ${equal ? '✓ True' : '✗ False'}`;
        } catch (_) { return null; }
    }

    const v = varMatch[0];
    const f = (val) => {
        const scope = { [v]: val };
        return math.evaluate(lhs, scope) - math.evaluate(rhs, scope);
    };

    try {
        for (const [lo, hi] of [[-1e3, 1e3], [-1e6, 1e6]]) {
            if (Math.sign(f(lo)) === Math.sign(f(hi))) continue;
            let a = lo, b = hi;
            for (let i = 0; i < 100; i++) {
                const mid = (a + b) / 2;
                if (Math.abs(f(mid)) < 1e-10) { a = b = mid; break; }
                if (Math.sign(f(a)) !== Math.sign(f(mid))) b = mid;
                else a = mid;
            }
            const root = (a + b) / 2;
            const display = parseFloat(root.toPrecision(10));
            return `${v} = ${Number.isInteger(display) ? display : parseFloat(display.toFixed(6))}`;
        }
    } catch (_) {}
    return null;
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
            if (/[a-df-wyzA-Z]/.test(norm)) continue;
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
