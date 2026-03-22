import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

async function generateEmbedding(content: string, openAiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: content,
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { chatbot_id, website_url } = await req.json();

    if (!chatbot_id || !website_url) throw new Error("Missing parameters");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    // —— الخطوة 1: استدعاء Vercel API للـ crawling ——
    const vercelUrl = Deno.env.get("VERCEL_APP_URL"); // مثال: https://omnisync.vercel.app
    
    if (!vercelUrl) throw new Error("VERCEL_APP_URL not configured in Supabase secrets");

    const crawlResponse = await fetch(`${vercelUrl}/api/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website_url }),
    });

    if (!crawlResponse.ok) {
      throw new Error(`Crawler failed: ${crawlResponse.statusText}`);
    }

    const crawlData = await crawlResponse.json();

    if (!crawlData.success || !crawlData.chunks?.length) {
      return new Response(
        JSON.stringify({
          success: false,
          status: crawlData.status || "failed",
          message: crawlData.message || "No content extracted",
          pages_scanned: 0,
          chunks_created: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // —— الخطوة 2: حذف الـ chunks القديمة ——
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("chatbot_id", chatbot_id);

    // —— الخطوة 3: حفظ الـ chunks الجديدة ——
    let totalChunksCreated = 0;

    for (const chunk of crawlData.chunks) {
      let embedding = null;
      
      if (openAiKey) {
        try {
          embedding = await generateEmbedding(chunk.content, openAiKey);
        } catch (err: any) {
          console.error(`Embedding error: ${err.message}`);
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

    return new Response(
      JSON.stringify({
        success: true,
        status: crawlData.status,
        message: crawlData.message,
        pages_scanned: crawlData.pages_scanned,
        chunks_created: totalChunksCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
