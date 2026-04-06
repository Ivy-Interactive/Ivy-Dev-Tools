import { pageEval } from "./pageEval";

function openProtocolUri(uri: string) {
  // DevTools panel is sandboxed; fire the protocol URI in the inspected page
  pageEval(`
    (function() {
      var a = document.createElement('a');
      a.href = ${JSON.stringify(uri)};
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    })()
  `);
}

function openInIdeNative(ide: string, filePath: string, lineNumber?: number) {
  const msg = { ide, file: filePath, line: lineNumber };
  chrome.runtime.sendNativeMessage(
    "com.ivy.devtools.file_opener",
    msg,
    (response) => {
      const err = chrome.runtime.lastError;
      if (err || !response?.success) {
        // Fall back to protocol URI for VS Code
        if (ide === "vscode") {
          const normalized = filePath.replace(/\\/g, "/");
          let uri = `vscode://file/${normalized}`;
          if (lineNumber) uri += `:${lineNumber}`;
          openProtocolUri(uri);
        }
      }
    }
  );
}

export function openInVSCode(filePath: string, lineNumber?: number) {
  openInIdeNative("vscode", filePath, lineNumber);
}

export function openInRider(filePath: string, lineNumber?: number) {
  openInIdeNative("rider", filePath, lineNumber);
}
