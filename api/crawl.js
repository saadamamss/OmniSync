import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

// ---------------------------------------------------------------------------
// Auth: this endpoint costs bandwidth + CPU, so it is only callable by our
// Supabase Edge Function which sends the shared secret in a header.
// Set CRAWL_SECRET on BOTH sides:
//   - Vercel env var (this function)
//   - Supabase secret `supabase secrets set CRAWL_SECRET=...`
// ---------------------------------------------------------------------------
function isAuthorized(req) {
  const secret = process.env.CRAWL_SECRET;
  if (!secret) return false; // fail closed if misconfigured
  const header = req.headers?.["x-crawl-secret"] ?? req.headers?.get?.("x-crawl-secret");
  return typeof header === "string" && header === secret;
}

// ---------------------------------------------------------------------------
// SSRF guard: the user supplies the URL, so we must never let it point at
// our own infrastructure (localhost, VPC, cloud metadata service, ...).
// ---------------------------------------------------------------------------

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 0) return true;                       // "this" network
  if (a === 10) return true;                      // 10/8
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true;        // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true;                      // multicast + reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const [first] = lower.split(":");
  if (first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") || first.startsWith("feb")) return true; // link-local
  if (/^f[cd]/.test(first)) return true;          // unique local fc00::/7
  if (first === "0" || first === "") return true; // unspecified / mapped
  return false;
}

// Returns null when the host is safe, or an error string when it must be rejected.
async function assertPublicHost(url) {
  if (url.port && url.port !== "80" && url.port !== "443") {
    return "non-standard ports are not allowed";
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    return "local addresses are not allowed";
  }

  const isLiteralIp = net.isIP(url.hostname) !== 0;
  if (isLiteralIp) {
    return net.isIPv4(url.hostname)
      ? (isPrivateIPv4(url.hostname) ? "private addresses are not allowed" : null)
      : (isPrivateIPv6(url.hostname) ? "private addresses are not allowed" : null);
  }

  let records;
  try {
    records = await dns.lookup(url.hostname, { all: true });
  } catch {
    return "could not resolve host";
  }
  // Safe as long as *no* resolved address is private.
  for (const { address, family } of records) {
    const bad = family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
    if (bad) return "host resolves to a private address";
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    // Tried without checking auth first: same shape for bad/missing secret.
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startedAt = Date.now();
  const MAX_MS = 60_000;
  const budget = () => MAX_MS - (Date.now() - startedAt);

  try {
    const { website_url } = req.body;

    if (!website_url) {
      return res.status(400).json({ error: "website_url is required" });
    }

    let targetUrl;
    try {
      targetUrl = new URL(website_url);
    } catch {
      return res.status(400).json({ error: "website_url must be a valid absolute URL" });
    }
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return res.status(400).json({ error: "website_url must start with http:// or https://" });
    }

    // Walk redirects manually (max 3) so every hop gets the SSRF check.
    // Node's automatic redirect following would skip our guards on hop+1.
    let current = targetUrl;
    let html = null;
    for (let hop = 0; hop <= 3; hop++) {
      const ssrfError = await assertPublicHost(current);
      if (ssrfError) {
        return res.status(400).json({ error: `Blocked: ${ssrfError}` });
      }
      if (budget() <= 0) {
        return res.status(504).json({ error: "Timed out" });
      }

      console.log(`Fetching (hop ${hop}): ${current.href}`);
      const response = await fetch(current, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OmniSyncBot/1.0)" },
        redirect: "manual",
        signal: AbortSignal.timeout(budget()),
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return res.status(502).json({ error: "Redirect with no location" });
        current = new URL(location, current);
        // Only http(s) survives the next loop's guards.
        if (current.protocol !== "http:" && current.protocol !== "https:") {
          return res.status(400).json({ error: "Redirected to a non-http(s) scheme" });
        }
        continue;
      }

      html = response;
      break;
    }

    if (!html || !html.ok) {
      return res.json({
        success: false,
        status: "failed",
        message: `Website returned HTTP ${html?.status ?? "unknown"}`,
        pages_scanned: 0,
        chunks_created: 0,
      });
    }

    const body = await html.text();
    const $ = cheerio.load(body);

    // Drop script/style/nav noise before extracting text
    // Header/nav/footer/aside are identical on every stored page — leaving
    // them in made every chunk look like the same data repeated.
    $("script, style, noscript, svg, iframe, header, nav, footer, aside, form, [role='banner'], [role='navigation'], [role='contentinfo']").remove();

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

    // Matches the old RecursiveCharacterTextSplitter behavior closely enough
    // for training: pack paragraphs into ~1000-char chunks with ~200 overlap.
    const split = splitText(text);

    const formattedChunks = split.map((chunk, index) => ({
      id: `chunk_${index}`,
      title: `Content chunk ${index + 1}`,
      content: chunk,
      metadata: { source: current.href },
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

function splitText(text, chunkSize = 1000, overlap = 50) {
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
    }
    else {
      current = current ? `${current} ${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);

  // Drop boilerplate duplicates: normalize each chunk and keep first-seen only.
  // The old pipeline stored near-identical chunks (nav/footer + overlap), which
  // made retrieval return "the same answer" many times in a row.
  const seen = new Set();
  return chunks.filter((chunk) => {
    const key = chunk.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
    if (chunk.length < 30 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
