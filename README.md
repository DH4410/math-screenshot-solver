# Math Screenshot Solver

A Windows desktop application that captures screenshots and automatically detects and solves mathematical equations using OCR and Claude AI.

## Features

- **Screenshot Capture**: Press `Ctrl+Shift+S` or click the capture button to take a screenshot
- **Drag-and-Select**: Select the specific area containing math equations (similar to Windows Snipping Tool)
- **OCR Detection**: Automatically extracts text from screenshots using Tesseract.js
- **Text Display**: Shows the detected text before solving for verification
- **Math Solving**: Uses Claude Opus 4.7 to detect and solve mathematical equations with step-by-step solutions
- **Copy Solution**: Easily copy the solution to clipboard with one click (`Ctrl+C` shortcut)
- **Visual Feedback**: See your captured screenshot and solution in a clean, modern interface
- **Persistent API Key**: Your API key is saved locally for convenience
- **Keyboard Shortcuts**: 
  - `Ctrl+Shift+S` - Capture screenshot
  - `Ctrl+C` - Copy answer (when solution is available)
  - `ESC` - Clear results or cancel capture
- **Error Handling**: Clear error messages for API issues, invalid keys, and rate limits

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
2. Enter your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/) (one-time setup, saved locally)
3. Press `Ctrl+Shift+S` or click "📸 Capture Screenshot"
4. Click and drag to select the area with the math equation (press `ESC` to cancel)
5. Wait for the app to:
   - Extract text using OCR (shows progress)
   - Display detected text
   - Detect mathematical content
   - Solve equations using Claude Opus 4.7
6. Review the detected text and step-by-step solution
7. Click "📋 Copy Answer" or press `Ctrl+C` to copy the solution
8. Click "🗑️ Clear" or press `ESC` to start over

## Example Use Cases

- Solving homework problems from textbooks or worksheets
- Checking calculations from handwritten notes
- Getting step-by-step solutions for complex equations
- Converting images of math problems to text solutions
- Quick math help during study sessions
- Verifying your own work on math problems

## Supported Math Content

- Basic arithmetic (addition, subtraction, multiplication, division)
- Algebra (linear equations, quadratic equations, polynomials)
- Calculus (derivatives, integrals, limits)
- Geometry (area, perimeter, volume calculations)
- Trigonometry (sine, cosine, tangent, identities)
- Statistics (mean, median, standard deviation)
- Word problems with mathematical content

## Tech Stack

- **Electron**: Desktop application framework
- **Tesseract.js**: OCR for text extraction
- **Anthropic Claude API**: Math equation detection and solving
- **Claude Opus 4.7**: AI model for mathematical reasoning

## Requirements

- Node.js 16 or higher
- Windows 10/11 (tested)
- Anthropic API key with Claude Opus 4.7 access
- Internet connection for API calls

## Troubleshooting

### "No text detected"
- Ensure the screenshot is clear and high contrast
- Try capturing a larger area
- Make sure text is not too small or blurry

### "Invalid API key"
- Verify your API key is correct from [console.anthropic.com](https://console.anthropic.com/)
- Make sure you copied the full key including the `sk-ant-` prefix

### "Model not available"
- Your API key may not have access to Claude Opus 4.7
- Check your plan at [console.anthropic.com](https://console.anthropic.com/)

### "No math equations detected"
- The screenshot may contain only text without mathematical content
- Try capturing an area with clear math notation or numbers

## Building

To build the application for distribution:
```bash
npm run build
```

This creates an installer in the `dist/` folder.

## License

MIT
