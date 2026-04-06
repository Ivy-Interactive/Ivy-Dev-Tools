# Ivy Dev Tools

Chrome DevTools extension for inspecting [Ivy](https://github.com/Ivy-Interactive/Ivy) applications.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

## Features

- **Widget Inspector** -- click to select any Ivy widget and view its type, ID, props, events, and ancestor tree.
- **Live Prop Editing** -- edit props in a property-grid UI (text, booleans, enums, colors, alignment, size, thickness) and see changes reflected in the running app.
- **Schema-Driven UI** -- fetches the widget schema from the Ivy dev server for accurate prop types, defaults, and enum values.
- **Source Location** -- shows where a widget is defined in code, with one-click open in VS Code or JetBrains Rider.
- **Tendril Detection** -- indicates when a Tendril environment is detected.

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

## Project Structure

```
src/
  background/       # Service worker (message routing, storage)
  content/          # Content script (injected into inspected pages)
  devtools/         # DevTools page (creates the panel)
  panel/            # React app for the DevTools panel
    components/     # UI components (WidgetDetails, EditablePropValue, Toolbar)
    helpers/        # Page eval bridge, widget editing, schema, picker
    hooks/          # Ivy detection, widget inspection
    styles/         # CSS (follows Chrome DevTools theme)
  shared/           # Types, messaging, storage shared across contexts
native-host/        # Native messaging host for IDE integration
public/             # Extension manifest
```

## Tech Stack

- **React 19** + **Zustand** for the panel UI
- **TanStack Query** for polling/caching
- **Vite** for building
- **TypeScript** throughout
- **Chrome Manifest V3** APIs (`chrome.devtools.inspectedWindow.eval`, native messaging)

## How It Works

The extension uses `chrome.devtools.inspectedWindow.eval()` to execute JavaScript in the inspected page. It walks the React fiber tree to find Ivy widget components, reads their props from the `WidgetNode`, and can mutate them in-place with a force re-render.

No content script injection is needed for core functionality -- everything runs through `eval()` in the page context.

## License

MIT
