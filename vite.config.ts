import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Local-only dev: route /api/crawl to scripts/crawl-server.mjs
  // (start it with: node scripts/crawl-server.mjs)
  server: {
    proxy: {
      "/api/crawl": "http://127.0.0.1:8787",
    },
  },
});
