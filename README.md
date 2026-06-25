# Math Screenshot Solver

A Windows desktop application that captures screenshots and automatically detects and solves mathematical equations using OCR and Claude AI.

## Features

- **Screenshot Capture**: Press `Ctrl+Shift+S` or click the capture button to take a screenshot
- **Drag-and-Select**: Select the specific area containing math equations
- **OCR Detection**: Automatically extracts text from screenshots using Tesseract.js
- **Math Solving**: Uses Claude Opus 4.7 to detect and solve mathematical equations
- **Copy Solution**: Easily copy the solution to clipboard

## Setup

1. Install dependencies:
```bash
npm install
```

2. Get an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)

3. Run the app:
```bash
npm start
```

4. Enter your Anthropic API key in the app (it will be saved locally)

## Usage

1. Launch the application
2. Enter your Anthropic API key
3. Press `Ctrl+Shift+S` or click "Capture Screenshot"
4. Click and drag to select the area with the math equation
5. Wait for the app to process and solve the equation
6. Click "Copy Answer" to copy the solution

## Tech Stack

- **Electron**: Desktop application framework
- **Tesseract.js**: OCR for text extraction
- **Anthropic Claude API**: Math equation detection and solving
- **Claude Opus 4.7**: AI model for mathematical reasoning

## Building

To build the application:
```bash
npm run build
```

## License

MIT
