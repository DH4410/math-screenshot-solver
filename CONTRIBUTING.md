# Contributing to Math Screenshot Solver

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. Fork the repository
2. Clone your fork:
```bash
git clone https://github.com/your-username/math-screenshot-solver.git
cd math-screenshot-solver
```

3. Install dependencies:
```bash
npm install
```

4. Start the development server:
```bash
npm start
```

## Project Structure

```
math-screenshot-solver/
├── main.js                 # Electron main process
├── index.html             # Main application UI
├── renderer.js            # Main window renderer process
├── capture.html           # Screenshot capture UI
├── capture-renderer.js    # Capture window renderer process
├── package.json           # Dependencies and scripts
└── README.md              # Documentation
```

## Key Components

### Main Process (`main.js`)
- Creates application windows
- Registers global keyboard shortcuts
- Handles IPC communication between windows

### Main Window (`index.html` + `renderer.js`)
- Displays captured screenshots
- Shows OCR results
- Manages API key storage
- Handles Claude API calls
- Provides copy and clear functionality

### Capture Window (`capture.html` + `capture-renderer.js`)
- Captures screen content
- Provides drag-to-select functionality
- Sends screenshot to main window

## Making Changes

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes
3. Test thoroughly
4. Commit with descriptive messages:
```bash
git commit -m "Add feature: description of what you added"
```

5. Push to your fork:
```bash
git push origin feature/your-feature-name
```

6. Open a Pull Request

## Code Style

- Use 4 spaces for indentation
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small
- Handle errors gracefully

## Testing

Before submitting a PR:
1. Test the screenshot capture functionality
2. Test OCR with various image types
3. Test math solving with different equation types
4. Test all keyboard shortcuts
5. Test error handling (invalid API key, network errors, etc.)

## Reporting Issues

When reporting issues, please include:
- Operating System and version
- Node.js version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots if applicable
- Error messages from console

## Feature Requests

We welcome feature requests! Please:
- Check existing issues first
- Describe the feature clearly
- Explain why it would be useful
- Provide examples if possible

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Update documentation if needed
- Test your changes thoroughly
- Describe what your PR does in the description
- Reference any related issues

## Areas for Contribution

Some ideas for contributions:
- Support for additional screenshot formats
- Improved OCR accuracy
- Support for other languages
- Dark mode theme
- Settings panel for customization
- History of solved problems
- Export solutions to file
- Support for handwritten equations
- Improved math notation rendering

## Questions?

Feel free to open an issue for any questions about contributing!
