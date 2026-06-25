const { ipcRenderer, clipboard } = require('electron');
const Tesseract = require('tesseract.js');
const math = require('mathjs');

let currentScreenshot = null;
let currentAnswer = null;

const elements = {
    screenshotPreview: document.getElementById('screenshotPreview'),
    detectedTextSection: document.getElementById('detectedTextSection'),
    detectedText: document.getElementById('detectedText'),
    resultSection: document.getElementById('resultSection'),
    resultText: document.getElementById('resultText'),
    captureBtn: document.getElementById('captureBtn'),
    copyBtn: document.getElementById('copyBtn'),
    clearBtn: document.getElementById('clearBtn')
};

elements.captureBtn.addEventListener('click', () => {
    ipcRenderer.send('open-capture');
});

elements.copyBtn.addEventListener('click', copyAnswer);

function copyAnswer() {
    if (currentAnswer) {
        clipboard.writeText(currentAnswer);
        const originalText = elements.copyBtn.textContent;
        elements.copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { elements.copyBtn.textContent = originalText; }, 2000);
    }
}

elements.clearBtn.addEventListener('click', clearResults);

function clearResults() {
    currentScreenshot = null;
    currentAnswer = null;
    elements.screenshotPreview.innerHTML = '';
    elements.screenshotPreview.classList.add('empty');
    elements.detectedTextSection.classList.add('hidden');
    elements.detectedText.textContent = '';
    elements.resultSection.classList.add('hidden');
    elements.resultText.textContent = '';
    elements.copyBtn.disabled = true;
    elements.clearBtn.disabled = true;
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'c' && currentAnswer && !elements.copyBtn.disabled) {
        e.preventDefault();
        copyAnswer();
    }
    if (e.key === 'Escape' && currentScreenshot) {
        clearResults();
    }
});

ipcRenderer.on('process-screenshot', async (event, dataUrl) => {
    currentScreenshot = dataUrl;
    elements.screenshotPreview.classList.remove('empty');
    elements.screenshotPreview.innerHTML = `<img src="${dataUrl}" alt="Screenshot">`;
    elements.resultSection.classList.remove('hidden');
    elements.resultText.className = 'loading';
    elements.resultText.textContent = 'Detecting text in screenshot...';
    elements.copyBtn.disabled = true;
    elements.clearBtn.disabled = false;

    try {
        const ocrText = await performOCR(dataUrl);

        if (!ocrText || ocrText.trim().length === 0) {
            elements.resultText.className = 'error';
            elements.resultText.textContent = 'No text detected. Try a clearer image.';
            return;
        }

        elements.detectedTextSection.classList.remove('hidden');
        elements.detectedText.textContent = ocrText;
        elements.resultText.className = 'loading';
        elements.resultText.textContent = 'Solving math equations...';

        const output = solveFromText(ocrText);

        if (!output) {
            elements.resultText.className = '';
            elements.resultText.textContent = 'No math expressions detected in the screenshot.';
            return;
        }

        currentAnswer = output;
        elements.resultText.className = '';
        elements.resultText.textContent = output;
        elements.copyBtn.disabled = false;

    } catch (error) {
        console.error(error);
        elements.resultText.className = 'error';
        elements.resultText.textContent = `Error: ${error.message}`;
    }
});

async function performOCR(imageData) {
    const result = await Tesseract.recognize(imageData, 'eng', {
        logger: info => {
            if (info.status === 'recognizing text') {
                const pct = Math.round(info.progress * 100);
                elements.resultText.textContent = `Detecting text... ${pct}%`;
            }
        }
    });
    return result.data.text;
}

// Normalize OCR artifacts into evaluatable math syntax
function normalizeExpr(str) {
    return str
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')   // unicode minus sign
        .replace(/²/g, '^2')  // superscript 2
        .replace(/³/g, '^3')  // superscript 3
        .replace(/√/g, 'sqrt(') // √ — closed below when used
        .replace(/(\d)\s+(\d)/g, '$1$2') // collapse digit gaps from OCR
        .replace(/(\d)([a-zA-Z])/g, '$1*$2') // implicit multiply: 2x → 2*x
        .replace(/([a-zA-Z])(\d)/g, '$1*$2') // xa → x*a
        .trim();
}

// Attempt to solve a single-variable equation like "2x + 5 = 11"
// Returns a string like "x = 3" or null on failure
function solveEquation(lhsRaw, rhsRaw) {
    const lhs = normalizeExpr(lhsRaw);
    const rhs = normalizeExpr(rhsRaw);

    // Detect the variable (first letter found)
    const varMatch = (lhs + rhs).match(/[a-df-wyzA-Z]/); // skip e (Euler's number)
    if (!varMatch) {
        // Pure numeric — just verify
        try {
            const l = math.evaluate(lhs);
            const r = math.evaluate(rhs);
            const equal = Math.abs(l - r) < 1e-9;
            return `${math.format(l, { precision: 10 })} = ${math.format(r, { precision: 10 })}  →  ${equal ? '✓ True' : '✗ False'}`;
        } catch (_) { return null; }
    }

    const v = varMatch[0];

    // Numerical bisection: find root of f(v) = lhs(v) - rhs(v) = 0
    const f = (val) => {
        const scope = { [v]: val };
        return math.evaluate(lhs, scope) - math.evaluate(rhs, scope);
    };

    try {
        // Scan a wide range for a sign change
        const ranges = [[-1e3, 1e3], [-1e6, 1e6]];
        for (const [lo, hi] of ranges) {
            let a = lo, b = hi;
            if (Math.sign(f(a)) === Math.sign(f(b))) continue;

            for (let i = 0; i < 100; i++) {
                const mid = (a + b) / 2;
                if (Math.abs(f(mid)) < 1e-10) { a = b = mid; break; }
                if (Math.sign(f(a)) !== Math.sign(f(mid))) b = mid;
                else a = mid;
            }

            const root = (a + b) / 2;
            // Round to reasonable precision
            const rounded = parseFloat(root.toPrecision(10));
            const display = Number.isInteger(rounded) ? rounded : parseFloat(rounded.toFixed(6));
            return `${v} = ${display}`;
        }
        return null;
    } catch (_) { return null; }
}

// Main solver: scan OCR text line by line, return formatted results
function solveFromText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const results = [];
    const seen = new Set();

    for (const line of lines) {
        // Skip lines with no digits/operators at all
        if (!/[\d\+\-\*\/\^=]/.test(line)) continue;

        const dedupeKey = line.replace(/\s+/g, '');
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        if (line.includes('=')) {
            const eqIdx = line.indexOf('=');
            const lhsRaw = line.slice(0, eqIdx);
            const rhsRaw = line.slice(eqIdx + 1);
            const solved = solveEquation(lhsRaw, rhsRaw);
            if (solved) results.push(`${line.trim()}\n  → ${solved}`);
        } else {
            // Expression — just evaluate
            const norm = normalizeExpr(line);
            // Skip if it still contains letters (variables with no equation)
            if (/[a-df-wyzA-Z]/.test(norm)) continue;
            try {
                const val = math.evaluate(norm);
                if (typeof val === 'number' || val?.isComplex) {
                    results.push(`${line.trim()} = ${math.format(val, { precision: 10 })}`);
                }
            } catch (_) { /* not evaluatable */ }
        }
    }

    return results.length ? results.join('\n\n') : null;
}
