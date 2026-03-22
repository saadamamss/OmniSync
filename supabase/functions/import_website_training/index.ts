import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER 1: توليد الـ Embedding
// ═══════════════════════════════════════════════════════════════════════════════
async function generateEmbedding(text: string, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text.slice(0, 8000), // حد OpenAI
      model: "text-embedding-3-small",
    }),
  });

  if (!response.ok) return null;
  const result = await response.json();
  return result.data[0].embedding;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER 2: تنظيف النص
// ═══════════════════════════════════════════════════════════════════════════════
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(
      /[^\w\s\u0621-\u064A\u0660-\u0669.,!?;:()[\]{}"'"@#$%^&*+=<>/\\|`~\-_]/g,
      "",
    )
    .replace(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g, "")
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER 3: تقسيم النص لـ chunks ذكية
// ═══════════════════════════════════════════════════════════════════════════════
function splitIntoChunks(
  text: string,
  title: string,
  wordsPerChunk = 400,
): Array<{ title: string; content: string }> {
  const paragraphs = text.split(/\n\n+/);
  const chunks: Array<{ title: string; content: string }> = [];
  let currentChunk = "";
  let chunkIndex = 1;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);

    // تجاهل الفقرات القصيرة جداً (أقل من 10 كلمات) — غالباً navigation أو labels
    if (words.length < 10) continue;

    const currentWords = currentChunk
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    if (
      currentWords + words.length > wordsPerChunk &&
      currentChunk.length > 0
    ) {
      chunks.push({
        title: chunks.length === 0 ? title : `${title} (Part ${chunkIndex})`,
        content: currentChunk.trim(),
      });
      chunkIndex++;
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim().length > 50) {
    chunks.push({
      title: chunks.length === 0 ? title : `${title} (Part ${chunkIndex})`,
      content: currentChunk.trim(),
    });
  }

  return chunks;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER 4: إزالة المحتوى المكرر
// ═══════════════════════════════════════════════════════════════════════════════
function removeDuplicates(
  chunks: Array<{ title: string; content: string }>,
): Array<{ title: string; content: string }> {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    // أخذ أول 100 حرف كمفتاح للمقارنة
    const key = chunk.content.slice(0, 100).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY 1: Jina AI Reader (الأقوى)
// يدعم JavaScript + يرجع Markdown نظيف
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchWithJina(url: string): Promise<string | null> {
  try {
    console.log(`[Jina] Trying: ${url}`);
    const jinaUrl = `https://r.jina.ai/${url}`;

    const response = await fetch(jinaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/plain",
        // X-Return-Format لضمان markdown
        "X-Return-Format": "markdown",
      },
      signal: AbortSignal.timeout(15000), // 15 ثانية timeout
    });

    if (!response.ok) {
      console.log(`[Jina] Failed with status: ${response.status}`);
      return null;
    }

    const text = await response.text();

    // تحقق من أن المحتوى ذو جودة
    const wordCount = text.split(/\s+/).filter((w) => w.length > 2).length;
    if (wordCount < 50) {
      console.log(`[Jina] Content too short: ${wordCount} words`);
      return null;
    }

    console.log(`[Jina] Success: ${wordCount} words`);
    return text;
  } catch (e: any) {
    console.log(`[Jina] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY 2: Direct Fetch + Smart Extraction
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchWithDirect(
  url: string,
): Promise<{ title: string; content: string } | null> {
  try {
    console.log(`[Direct] Trying: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // استخراج العنوان
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : url;

    // إزالة العناصر غير المفيدة بالـ Regex
    let cleaned = html
      // إزالة scripts
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      // إزالة styles
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      // إزالة nav
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      // إزالة footer
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      // إزالة header
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
      // إزالة aside
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
      // إزالة forms
      .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, " ")
      // تحويل br و p و div إلى أسطر جديدة
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
      // إزالة باقي الـ tags
      .replace(/<[^>]+>/g, " ")
      // فك HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, " ");

    const content = cleanText(cleaned);
    const wordCount = content.split(/\s+/).filter((w) => w.length > 2).length;

    if (wordCount < 50) {
      console.log(`[Direct] Content too short: ${wordCount} words`);
      return null;
    }

    console.log(`[Direct] Success: ${wordCount} words`);
    return { title: pageTitle, content };
  } catch (e: any) {
    console.log(`[Direct] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY 3: Sitemap Discovery
// ═══════════════════════════════════════════════════════════════════════════════
async function discoverUrlsFromSitemap(baseUrl: string): Promise<string[]> {
  const sitemapUrls = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap/sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) continue;

      const xml = await response.text();
      const urlMatches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];

      const urls = urlMatches
        .map((m) => m.replace(/<\/?loc>/g, "").trim())
        .filter((u) => {
          // تجاهل الصور والملفات
          return !u.match(/\.(jpg|jpeg|png|gif|pdf|zip|css|js|xml)$/i);
        })
        .slice(0, 20); // أقصى 20 صفحة من الـ sitemap

      if (urls.length > 0) {
        console.log(`[Sitemap] Found ${urls.length} URLs from ${sitemapUrl}`);
        return urls;
      }
    } catch (e) {
      continue;
    }
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION: معالجة صفحة واحدة
// ═══════════════════════════════════════════════════════════════════════════════
async function processPage(
  url: string,
): Promise<{ title: string; content: string } | null> {
  // المحاولة 1: Jina AI
  const jinaContent = await fetchWithJina(url);
  if (jinaContent) {
    // استخراج العنوان من Markdown (أول سطر يبدأ بـ #)
    const titleMatch = jinaContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : url;
    const cleaned = cleanText(jinaContent);
    return { title, content: cleaned };
  }

  // المحاولة 2: Direct Fetch
  const directContent = await fetchWithDirect(url);
  if (directContent) return directContent;

  // فشل كل المحاولتين
  console.log(`[processPage] Both strategies failed for: ${url}`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SERVE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { chatbot_id, website_url } = await req.json();
    if (!chatbot_id || !website_url) throw new Error("Missing parameters");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    const baseUrl = new URL(website_url);
    const domain = baseUrl.hostname;

    // ─── اكتشاف الـ URLs ───────────────────────────────────────────────────────
    const visited = new Set<string>();
    let queue: string[] = [];

    // أولاً: جرّب الـ Sitemap
    const sitemapUrls = await discoverUrlsFromSitemap(baseUrl.origin);
    if (sitemapUrls.length > 0) {
      queue = sitemapUrls;
      console.log(`[Main] Using sitemap: ${queue.length} URLs`);
    } else {
      // استخدم الـ URL الأصلي + صفحات شائعة
      queue = [
        baseUrl.href,
        `${baseUrl.origin}/about`,
        `${baseUrl.origin}/about-us`,
        `${baseUrl.origin}/services`,
        `${baseUrl.origin}/products`,
        `${baseUrl.origin}/contact`,
        `${baseUrl.origin}/faq`,
        `${baseUrl.origin}/pricing`,
        `${baseUrl.origin}/blog`,
      ];
      console.log(`[Main] No sitemap found, using default URLs`);
    }

    const maxPages = 15;
    let pagesScanned = 0;
    let totalChunksCreated = 0;
    let failedPages = 0;
    const allChunks: Array<{ title: string; content: string }> = [];

    // حذف الـ chunks القديمة أولاً
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("chatbot_id", chatbot_id);

    // ─── معالجة كل صفحة ───────────────────────────────────────────────────────
    for (const url of queue) {
      if (pagesScanned >= maxPages) break;
      if (visited.has(url)) continue;

      // تأكد أن الـ URL من نفس الـ domain
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== domain) continue;
      } catch {
        continue;
      }

      visited.add(url);

      const result = await processPage(url);

      if (!result) {
        failedPages++;
        continue;
      }

      // تقسيم المحتوى لـ chunks ذكية
      const pageChunks = splitIntoChunks(result.content, result.title);
      allChunks.push(...pageChunks);
      pagesScanned++;

      console.log(
        `[Main] Page ${pagesScanned}: "${result.title}" → ${pageChunks.length} chunks`,
      );
    }

    // ─── إزالة التكرار ─────────────────────────────────────────────────────────
    const uniqueChunks = removeDuplicates(allChunks);
    console.log(
      `[Main] After dedup: ${allChunks.length} → ${uniqueChunks.length} chunks`,
    );

    // ─── حفظ في قاعدة البيانات ──────────────────────────────────────────────────
    for (const chunk of uniqueChunks) {
      // تجاهل الـ chunks القصيرة جداً
      const wordCount = chunk.content
        .split(/\s+/)
        .filter((w) => w.length > 2).length;
      if (wordCount < 30) continue;

      let embedding = null;
      if (openAiKey) {
        try {
          embedding = await generateEmbedding(chunk.content, openAiKey);
        } catch (err: any) {
          console.error(`[Main] Embedding error: ${err.message}`);
        }
      }

      await supabase.from("knowledge_chunks").insert({
        chatbot_id,
        title: chunk.title,
        content: chunk.content,
        embedding,
      });

      totalChunksCreated++;
    }

    // ─── بناء تقرير واضح للمستخدم ───────────────────────────────────────────────────
    let status = "success";
    let message = "";

    if (pagesScanned === 0) {
      status = "failed";
      message =
        "Could not extract content from this website. It may be protected or require JavaScript rendering beyond our capabilities.";
    } else if (pagesScanned < 3) {
      status = "partial";
      message = `Only ${pagesScanned} page(s) could be scanned. The website may have limited public content or access restrictions.`;
    } else {
      message = `Successfully trained on ${pagesScanned} pages with ${totalChunksCreated} knowledge topics.`;
    }

    return new Response(
      JSON.stringify({
        success: status !== "failed",
        status,
        message,
        pages_scanned: pagesScanned,
        chunks_created: totalChunksCreated,
        failed_pages: failedPages,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
