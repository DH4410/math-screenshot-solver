# Changelog

All notable changes to Math Screenshot Solver will be documented in this file.

## [1.1.1] - 2026-06-27

### Added
- Answer is now copied to the clipboard automatically on solve (the Copy button still works)

### Fixed
- `x` between two numbers is treated as multiplication (`12x 45` → `12 × 45 = 540`), since OCR
  reads the `×` sign as `x`; genuine algebra like `2x = 10` is unaffected
- Capture overlay now re-asserts full-display bounds after showing, so it greys the *whole*
  monitor (previously a secondary monitor at a different DPI than the primary could be only
  partly covered). Logs display topology to the terminal to aid debugging

## [1.1.0] - 2026-06-27

### Changed
- Global hotkey is now `Alt+Shift+S` (the old `Shift+Win+W` is reserved by Windows and was
  silently swallowed by the OS, so it never fired)

### Added
- Snipping-Tool-style capture overlay: floating toolbar, live pixel dimensions, corner handles
- **Full screen** button on the overlay to grab an entire monitor in one click
- Multi-pass OCR that cross-checks several readings and keeps whichever one parses as real math
- Best-effort exponent recovery: when an OCR pass does read a raised digit, it is rebuilt as a
  power (`x^2`). Caveat — offline OCR (Tesseract) frequently drops or misreads small
  superscripts entirely, so powers/squares are still unreliable; reading them dependably needs
  a vision model
- Otsu binarization in the OCR preprocessing pipeline for cleaner black-on-white text

### Fixed
- Multi-monitor capture: overlay no longer overflows HiDPI screens, and each monitor is now
  matched to the correct screenshot (previously the wrong screen could appear on a monitor)

## [1.0.0] - 2026-06-25

### Added
- Initial release of Math Screenshot Solver
- Screenshot capture with drag-and-select functionality
- OCR text extraction using Tesseract.js
- Math equation detection and solving using Claude Opus 4.7
- Keyboard shortcuts:
  - `Ctrl+Shift+S` - Capture screenshot
  - `Ctrl+C` - Copy answer
  - `ESC` - Clear results or cancel capture
- Display of detected text before solving
- Copy-to-clipboard functionality
- Clear button to reset interface
- API key persistence in local storage
- Error handling for common API issues
- Visual feedback during OCR and solving process
- Modern, gradient-styled UI
- Progress indicators during OCR
- Link to Anthropic console for API key

### Features
- Supports wide range of math content (arithmetic, algebra, calculus, geometry, etc.)
- Step-by-step solution explanations
- Clear error messages for troubleshooting
- Cross-platform Electron application
- Screenshot preview
- Result scrolling for long solutions
