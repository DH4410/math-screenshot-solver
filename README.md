# Math Screenshot Solver

A Windows desktop application that captures screenshots and automatically detects and solves mathematical equations using OCR and Claude AI.

## Features

- **Screenshot Capture**: Press `Ctrl+Shift+S` or click the capture button to take a screenshot
- **Drag-and-Select**: Select the specific area containing math equations (similar to Windows Snipping Tool)
- **OCR Detection**: Automatically extracts text from screenshots using Tesseract.js
- **Math Solving**: Uses Claude Opus 4.7 to detect and solve mathematical equations with step-by-step solutions
- **Copy Solution**: Easily copy the solution to clipboard with one click
- **Visual Feedback**: See your captured screenshot and solution in a clean, modern interface
- **Persistent API Key**: Your API key is saved locally for convenience

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
2. Enter your Anthropic API key (one-time setup, saved locally)
3. Press `Ctrl+Shift+S` or click "📸 Capture Screenshot"
4. Click and drag to select the area with the math equation (press ESC to cancel)
5. Wait for the app to:
   - Extract text using OCR
   - Detect mathematical content
   - Solve equations using Claude Opus 4.7
6. Review the step-by-step solution
7. Click "📋 Copy Answer" to copy the solution to clipboard

## Example Use Cases

- Solving homework problems from textbooks or worksheets
- Checking calculations from handwritten notes
- Getting step-by-step solutions for complex equations
- Converting images of math problems to text solutions
- Quick math help during study sessions

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
