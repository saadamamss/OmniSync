import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { spawn } from "child_process";

// Dev-only convenience: start scripts/crawl-server.mjs alongside `npm run dev`
// so "Sync Now" works with zero extra terminals. Skips itself if the port is
// already taken (i.e. you started the server manually).
function crawlServerPlugin() {
  let child = null;
  return {
    name: "local-crawl-server",
    configureServer() {
      child = spawn(process.execPath, ["scripts/crawl-server.mjs"], {
        stdio: ["ignore", "inherit", "inherit"],
        env: process.env,
      });
      child.on("error", (code) => {
        console.log("[vite] crawl server exited:", code);
      });
      process.on("SIGINT", () => child?.kill("SIGTERM"));
      process.on("SIGTERM", () => child?.kill("SIGTERM"));
    },
    closeBundle() {
      child?.kill("SIGTERM");
    },
  };
}

export default defineConfig({
  plugins: [vue(), crawlServerPlugin()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Local-only dev: route /api/crawl to scripts/crawl-server.mjs
  server: {
    proxy: {
      "/api/crawl": "http://127.0.0.1:8787",
    },
  },
});
