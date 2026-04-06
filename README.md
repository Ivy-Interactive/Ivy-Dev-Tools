# Ivy Dev Tools

Chrome DevTools extension for inspecting [Ivy](https://github.com/Ivy-Interactive/Ivy) applications.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

## Features

- **Widget Inspector** Click to select any Ivy widget and view its type, ID, props, events, and ancestor tree.
- **Live Prop Editing** Edit props in a property-grid UI (text, booleans, enums, colors, alignment, size, thickness) and see changes reflected in the running app.
- **Source Location** Shows where a widget is defined in code, with one-click open in VS Code or JetBrains Rider.

## Quick Start (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- Google Chrome
- An Ivy application running locally (e.g. `http://localhost:5010`)

### One-Command Setup (Windows)

```powershell
.\dev.ps1 -Url "http://localhost:5010"
```

This installs dependencies, builds the extension, launches Chrome with it loaded, and watches for file changes.

### Manual Setup

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Or watch for changes
npm run dev
```

Then load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder
5. Open DevTools (F12) on any Ivy app -- the **Ivy** tab appears in the DevTools panel

## Open in IDE (Optional)

The "VS Code" and "Rider" buttons in the Source Location section open files directly in your editor. This requires a one-time native messaging host setup:

```powershell
# Install the native messaging host
powershell -ExecutionPolicy Bypass -File native-host/install.ps1
```

The script will ask for your Chrome extension ID (found on `chrome://extensions`). Restart Chrome after installing.

**Note:** The native host supports both VS Code (`vscode://` protocol) and JetBrains Rider (launches `rider64.exe` directly).

## How It Works

The extension uses `chrome.devtools.inspectedWindow.eval()` to execute JavaScript in the inspected page. It walks the React fiber tree to find Ivy widget components, reads their props from the `WidgetNode`, and can mutate them in-place with a force re-render.

No content script injection is needed for core functionality -- everything runs through `eval()` in the page context.

## License

Apache 2.0 -- see [LICENSE](LICENSE).
MIT
