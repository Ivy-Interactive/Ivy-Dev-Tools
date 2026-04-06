import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { extensionReload } from "./plugins/vite-plugin-extension-reload";

const isDev = process.argv.includes("--watch");

export default defineConfig({
  plugins: [react(), ...(isDev ? [extensionReload()] : [])],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@panel": resolve(__dirname, "src/panel"),
    },
  },
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(__dirname, "src/devtools/devtools.html"),
        panel: resolve(__dirname, "src/panel/panel.html"),
        background: resolve(__dirname, "src/background/service-worker.ts"),
        "content-script": resolve(__dirname, "src/content/content-script.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background/service-worker.js";
          }
          if (chunkInfo.name === "content-script") {
            return "content/content-script.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
