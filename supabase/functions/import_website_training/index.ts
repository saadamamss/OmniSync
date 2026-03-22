import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateEmbedding(text: string, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-small",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();
  return result.data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { chatbot_id, website_url } = await req.json();
    if (!chatbot_id || !website_url) throw new Error("Missing parameters");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    
    if (!openAiKey) {
      console.error("[import_website_training] OPENAI_API_KEY is not set in Supabase secrets.");
    }

    const baseUrl = new URL(website_url);
    const domain = baseUrl.hostname;

    const visited = new Set<string>();
    const queue = [baseUrl.href];
    const maxPages = 15; 
    
    let pagesScanned = 0;
    let totalChunksCreated = 0;

    while (queue.length > 0 && pagesScanned < maxPages) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      try {
        console.log(`[import_website_training] Crawling: ${currentUrl}`);
        const response = await fetch(currentUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });

        if (!response.ok) continue;
        const html = await response.text();
        const document = new DOMParser().parseFromString(html, "text/html");
        if (!document) continue;

        // 1. Discover links
        const links = document.querySelectorAll("a");
        links.forEach((link: any) => {
          const href = link.getAttribute("href");
          if (href) {
            try {
              const absoluteUrl = new URL(href, currentUrl);
              if (absoluteUrl.hostname === domain && !visited.has(absoluteUrl.href)) {
                if (!absoluteUrl.href.match(/\.(jpg|jpeg|png|gif|pdf|zip|css|js)$/i) && !absoluteUrl.href.includes('#')) {
                  queue.push(absoluteUrl.href);
                }
              }
            } catch (e) { /* invalid link */ }
          }
        });

        // 2. Extract content
        const selectorsToRemove = ["script", "style", "noscript", "iframe", "svg", "nav", "footer", "header"];
        selectorsToRemove.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));

        const rawText = document.body?.innerText || document.body?.textContent || "";
        const cleanText = rawText.replace(/\s+/g, " ").trim();

        if (cleanText.length > 100) {
          const words = cleanText.split(/\s+/);
          const chunks = [];
          for (let i = 0; i < words.length; i += 500) {
            chunks.push(words.slice(i, i + 500).join(" "));
          }

          const pageTitle = document.querySelector("title")?.textContent || currentUrl;
          
          for (const content of chunks) {
            let embedding = null;
            if (openAiKey) {
              try {
                embedding = await generateEmbedding(content, openAiKey);
              } catch (err) {
                console.error(`[import_website_training] Embedding error: ${err.message}`);
              }
            }

            await supabase.from("knowledge_chunks").insert({
              chatbot_id,
              title: `Page: ${pageTitle}`,
              content,
              embedding
            });
            totalChunksCreated++;
          }
          pagesScanned++;
        }
      } catch (e) {
        console.error(`[import_website_training] Error on ${currentUrl}:`, e.message);
      }
    }

    return new Response(JSON.stringify({ success: true, pages_scanned: pagesScanned, chunks_created: totalChunksCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
