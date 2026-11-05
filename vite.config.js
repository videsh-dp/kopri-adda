import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production builds are served from GitHub Pages at /<repo>/, so assets and
// routes need that prefix. Override with BASE_PATH (e.g. "/" for a custom
// domain). The dev server always runs at "/"; `vite preview` mirrors Pages.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? process.env.BASE_PATH || "/kopri-adda/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
  },
}));
