import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API sets its session cookie on path /api with SameSite=Strict. Proxying /api through the
// Vite dev server keeps the web app and the API on one origin, so the cookie just works.
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: API_TARGET, changeOrigin: false } },
  },
  preview: {
    port: 5173,
    proxy: { "/api": { target: API_TARGET, changeOrigin: false } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    css: false,
  },
});
