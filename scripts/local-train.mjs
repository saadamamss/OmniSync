#!/usr/bin/env node
// Local end-to-end training test — bypasses Vercel/Edge Functions entirely.
//
//   node scripts/local-train.mjs <website_url> <chatbot_id>
//
// 1. Runs the local crawler (api/crawl.js) on the URL
// 2. Prints the extracted chunks
// 3. Writes supabase-test-training.sql with INSERTs for knowledge_chunks
//    (embedding = NULL → your chat still finds them via keyword search)
//
// Then paste the generated .sql into Supabase SQL Editor and chat with the bot.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
process.env.CRAWL_SECRET ??= "local-dev-secret";

const handler = require("../api/crawl.js").default;

const url = process.argv[2];
const chatbotId = process.argv[3];

if (!url) {
  console.error("Usage: node scripts/local-train.mjs <website_url> [chatbot_id]");
  process.exit(1);
}

// --- 1. crawl ---------------------------------------------------------------
const res = {
  headers: {},
  setHeader() {},
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
  end() {},
};
await handler({ method: "POST", headers: { "x-crawl-secret": process.env.CRAWL_SECRET }, body: { website_url: url } }, res);

const body = res.body;
if (!body?.success) {
  console.error("✗ crawl failed:", JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(`✓ crawled ${url}`);
console.log(`  pages_scanned=${body.pages_scanned} chunks=${body.chunks_created}`);

// --- 2. show chunks ---------------------------------------------------------
for (const chunk of body.chunks) {
  console.log(`  #${chunk.id} (${chunk.content.length} chars): ${chunk.content.slice(0, 90).replace(/\n/g, " ")}…`);
}

// --- 3. SQL for pasting into Supabase --------------------------------------
if (chatbotId) {
  const esc = (s) => s.replace(/'/g, "''");
  // One chunk insert per row; embeddings stay NULL (keyword search covers it).
  const values = body.chunks.map(
    (c) => `('${chatbotId}', ${esc(`Local test: ${url}`)}, ${esc(c.content)})`
  ).join(",\n  ");

  const sql = `-- Local training test for chatbot ${chatbotId}
-- Delete previous test chunks first (careful: wipes ALL knowledge for this bot)
delete from knowledge_chunks where chatbot_id = '${chatbotId}';

insert into knowledge_chunks (chatbot_id, title, content) values
  ${values};`;

  writeFileSync("supabase-test-training.sql", sql);
  console.log(`\n✓ wrote supabase-test-training.sql (${body.chunks.length} chunks)`);
  console.log("  → paste it into Supabase SQL Editor, then chat with your bot.");
} else {
  console.log("\n(no chatbot_id given — only crawled, no SQL generated)");
}
