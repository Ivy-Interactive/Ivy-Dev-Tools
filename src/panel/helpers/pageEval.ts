/**
 * Execute JavaScript in the inspected page via chrome.devtools.inspectedWindow.eval().
 * This is the most reliable way for a DevTools panel to interact with the page —
 * no content script injection needed.
 */
export function pageEval<T = unknown>(code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(code, (result, error) => {
      if (error) {
        reject(new Error(error.description || error.code || "eval failed"));
      } else {
        resolve(result as T);
      }
    });
  });
}
