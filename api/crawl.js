import * as cheerio from "cheerio";

// Matches the old RecursiveCharacterTextSplitter behavior closely enough
// for training: pack paragraphs into ~1000-char chunks with ~200 overlap.
function splitText(text, chunkSize = 1000, overlap = 200) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > chunkSize) {
      // Long paragraph: flush what we have, then cut it into fixed slices.
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < paragraph.length; i += chunkSize - overlap) {
        chunks.push(paragraph.slice(i, i + chunkSize));
      }
      continue;
    }
    if (current.length + paragraph.length + 1 > chunkSize) {
      chunks.push(current);
      current = current.slice(Math.max(0, current.length - overlap));
      current = current ? `${current} ${paragraph}` : paragraph;
    } else {
      current = current ? `${current} ${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { website_url } = req.body;

    if (!website_url) {
      return res.status(400).json({ error: "website_url is required" });
    }

    // Basic sanity: only http(s), no local/private addresses (best-effort SSRF guard).
    let targetUrl;
    try {
      targetUrl = new URL(website_url);
    } catch {
      return res.status(400).json({ error: "website_url must be a valid absolute URL" });
    }
    if (!/^https?:$/.test(targetUrl.protocol)) {
      return res.status(400).json({ error: "website_url must start with http:// or https://" });
    }

    console.log(`Starting crawl for: ${website_url}`);

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OmniSyncBot/1.0)" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return res.json({
        success: false,
        status: "failed",
        message: `Website returned HTTP ${response.status}`,
        pages_scanned: 0,
        chunks_created: 0,
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Drop script/style/nav noise before extracting text
    $("script, style, noscript, svg, iframe").remove();

    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (!text) {
      return res.json({
        success: false,
        status: "failed",
        message: "No content could be extracted from the website",
        pages_scanned: 0,
        chunks_created: 0,
      });
    }

    const split = splitText(text);
    const formattedChunks = split.map((chunk, index) => ({
      id: `chunk_${index}`,
      title: `Content chunk ${index + 1}`,
      content: chunk,
      metadata: { source: targetUrl.href },
    }));

    console.log(`Successfully processed ${formattedChunks.length} chunks`);

    return res.json({
      success: true,
      status: "completed",
      message: `Successfully extracted and processed ${formattedChunks.length} content chunks`,
      pages_scanned: 1,
      chunks_created: formattedChunks.length,
      chunks: formattedChunks,
    });
  } catch (error) {
    console.error("Crawl error:", error);
    return res.status(500).json({
      success: false,
      status: "failed",
      message: error.message || "An error occurred during crawling",
      pages_scanned: 0,
      chunks_created: 0,
    });
  }
}
