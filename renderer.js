const { ipcRenderer, clipboard } = require('electron');
const Tesseract = require('tesseract.js');
const Anthropic = require('@anthropic-ai/sdk');

let currentScreenshot = null;
let currentAnswer = null;
const API_KEY_STORAGE = 'anthropic_api_key';

const elements = {
    apiKeyInput: document.getElementById('apiKey'),
    screenshotPreview: document.getElementById('screenshotPreview'),
    detectedTextSection: document.getElementById('detectedTextSection'),
    detectedText: document.getElementById('detectedText'),
    resultSection: document.getElementById('resultSection'),
    resultText: document.getElementById('resultText'),
    captureBtn: document.getElementById('captureBtn'),
    copyBtn: document.getElementById('copyBtn'),
    clearBtn: document.getElementById('clearBtn')
};

// Load saved API key
const savedApiKey = localStorage.getItem(API_KEY_STORAGE);
if (savedApiKey) {
    elements.apiKeyInput.value = savedApiKey;
}

// Save API key on change
elements.apiKeyInput.addEventListener('change', () => {
    localStorage.setItem(API_KEY_STORAGE, elements.apiKeyInput.value);
});

elements.captureBtn.addEventListener('click', () => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('close-capture');
    setTimeout(() => {
        const { BrowserWindow } = require('electron').remote || require('@electron/remote');
        const captureWin = new BrowserWindow({
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
        captureWin.loadFile('capture.html');
    }, 100);
});

elements.copyBtn.addEventListener('click', copyAnswer);

function copyAnswer() {
    if (currentAnswer) {
        clipboard.writeText(currentAnswer);
        const originalText = elements.copyBtn.textContent;
        elements.copyBtn.textContent = '✓ Copied!';
        setTimeout(() => {
            elements.copyBtn.textContent = originalText;
        }, 2000);
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+C to copy answer when available
    if (e.ctrlKey && e.key === 'c' && currentAnswer && !elements.copyBtn.disabled) {
        e.preventDefault();
        copyAnswer();
    }
    // Escape to clear
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
        const ocrResult = await performOCR(dataUrl);

        if (!ocrResult || ocrResult.trim().length === 0) {
            elements.resultText.className = 'error';
            elements.resultText.textContent = 'No text detected in screenshot. Please try again with a clearer image.';
            return;
        }

        elements.detectedTextSection.classList.remove('hidden');
        elements.detectedText.textContent = ocrResult;

        elements.resultText.className = 'loading';
        elements.resultText.textContent = 'Analyzing for math equations...';

        const hasMath = await checkForMathAndSolve(ocrResult, dataUrl);

        if (!hasMath) {
            elements.resultText.className = '';
            elements.resultText.textContent = 'No math equations detected in the screenshot.';
        }

    } catch (error) {
        console.error('Error processing screenshot:', error);
        elements.resultText.className = 'error';
        elements.resultText.textContent = `Error: ${error.message}`;
    }
});

async function performOCR(imageData) {
    const result = await Tesseract.recognize(imageData, 'eng', {
        logger: info => {
            if (info.status === 'recognizing text') {
                const progress = Math.round(info.progress * 100);
                elements.resultText.textContent = `Detecting text... ${progress}%`;
            }
        }
    });

    return result.data.text;
}

async function checkForMathAndSolve(text, imageData) {
    const apiKey = elements.apiKeyInput.value.trim();

    if (!apiKey) {
        elements.resultText.className = 'error';
        elements.resultText.textContent = 'Please enter your Anthropic API key first.';
        return false;
    }

    try {
        const anthropic = new Anthropic({
            apiKey: apiKey,
        });

        const base64Image = imageData.split(',')[1];

        const message = await anthropic.messages.create({
            model: 'claude-opus-4-7',
            max_tokens: 4096,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: base64Image,
                            },
                        },
                        {
                            type: 'text',
                            text: `Analyze this screenshot and determine if it contains any mathematical equations, problems, or expressions.

OCR extracted text: "${text}"

If there are math equations or problems:
1. Identify all mathematical content
2. Solve each problem step-by-step
3. Provide clear, final answers

If there are NO math equations, respond with exactly: "NO_MATH_DETECTED"

Format your response clearly with the solution(s).`
                        }
                    ]
                }
            ]
        });

        const response = message.content[0].text;

        if (response.includes('NO_MATH_DETECTED')) {
            return false;
        }

        currentAnswer = response;
        elements.resultText.className = '';
        elements.resultText.textContent = response;
        elements.copyBtn.disabled = false;
        return true;

    } catch (error) {
        console.error('Claude API error:', error);
        elements.resultText.className = 'error';

        if (error.status === 401) {
            elements.resultText.textContent = 'API Error: Invalid API key. Please check your Anthropic API key.';
        } else if (error.status === 429) {
            elements.resultText.textContent = 'API Error: Rate limit exceeded. Please wait a moment and try again.';
        } else if (error.message.includes('model')) {
            elements.resultText.textContent = 'API Error: Model not available. Your API key may not have access to Claude Opus 4.7.';
        } else {
            elements.resultText.textContent = `API Error: ${error.message}`;
        }
        return false;
    }
}
