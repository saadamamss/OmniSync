#!/usr/bin/env node
// Local crawl server — makes "Sync Now" work without Vercel/Edge Functions.
//
//   node scripts/crawl-server.mjs          # port 8787
//   CRAWL_SECRET=whatever node scripts/crawl-server.mjs
//
// Vite proxies /api/crawl → here during `npm run dev` (see vite.config.ts).

import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const handler = require("../api/crawl.js").default;

const SECRET = process.env.CRAWL_SECRET ?? "local-dev-secret";
// The handler reads its own check from process.env — keep them in sync.
process.env.CRAWL_SECRET = SECRET;
const PORT = Number(process.env.PORT ?? 8787);

const server = http.createServer(async (req, res) => {
  // Collect the body
  let raw = "";
  for await (const chunk of req) raw += chunk;

  const mock = {
    headers: req.headers,
    method: req.method,
    body: raw ? JSON.parse(raw) : {},
    setHeader(k, v) { res.setHeader(k, v); return this; },
    status(code) { res.statusCode = code; return this; },
    json(obj) {
      res.statusCode ??= 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return this;
    },
    end() { res.end(); },
  };
  res.statusCode = 200;

  try {
    await handler(mock, mock);
  } catch (err) {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, message: String(err) }));
    }
  }

  if (!res.writableEnded) {
    res.statusCode = 200;
    res.end(JSON.stringify({ success: false, message: "no response from handler" }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[crawl] local server ready → http://127.0.0.1:${PORT}/api/crawl (CRAWL_SECRET=${SECRET === "local-dev-secret" ? "default dev secret" : "custom"})`);
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    // Probably already running (manual start or an existing dev session) —
    // the vite proxy will hit that instance instead. Exit quietly.
    console.log(`[crawl] port ${PORT} already serving → reusing it`);
    process.exit(0);
  }
  throw err;
});
