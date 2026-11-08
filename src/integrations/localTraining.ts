// Local-development website training.
//
// In dev (`npm run dev`), "Sync Now" calls scripts/crawl-server.mjs via the
// vite proxy and writes knowledge_chunks directly with the current user's
// session — fully local, no Vercel, no Edge Functions.
// In production builds this module is never imported (guarded by callers).

import { supabase } from "@/integrations/supabase/client";

export interface CrawlChunk {
  id: string;
  title: string;
  content: string;
  metadata?: { source: string };
}

export interface LocalTrainingResult {
  pages_scanned: number;
  chunks_created: number;
}

export const crawlLocally = async (
  websiteUrl: string,
  chatbotId: string,
): Promise<LocalTrainingResult> => {
  const res = await fetch("/api/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-crawl-secret": "local-dev-secret" },
    body: JSON.stringify({ website_url: websiteUrl }),
  });

  if (res.status === 401) {
    throw new Error("Local crawl server rejected the secret — restart it: node scripts/crawl-server.mjs");
  }
  if (!res.ok) {
    throw new Error(`Local crawl server returned HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "Crawl failed on the local server");
  }
  const chunks: CrawlChunk[] = data.chunks ?? [];

  // Replace this bot's knowledge with the fresh crawl.
  await supabase.from("knowledge_chunks").delete().eq("chatbot_id", chatbotId);
  const { error } = await supabase.from("knowledge_chunks").insert(
    chunks.map((c) => ({
      chatbot_id: chatbotId,
      title: `Website: ${websiteUrl}`,
      content: c.content,
    })),
  );
  if (error) throw new Error("Saving knowledge failed: " + error.message);

  return {
    pages_scanned: data.pages_scanned ?? 1,
    chunks_created: chunks.length,
  };
};
