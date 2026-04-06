chrome.devtools.panels.create(
  "Ivy",
  "",
  "src/panel/panel.html",
  (panel) => {
    console.log("[Ivy DevTools] Panel created", panel);
  }
);
