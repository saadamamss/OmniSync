// Unified ingestion pipeline — the only place knowledge is written.
//
//   [pasted text | PDF-extracted text]
//     → clean()                  normalize whitespace, drop noise lines
//     → semanticChunk()          ~350-token chunks at paragraph/sentence boundaries
//     → sha256(chunk)            dedupe (identical content is never re-embedded)
//     → insert knowledge_chunks  with document_id + content_hash
//
// Runs server-side on purpose: the browser must never see OPENAI_API_KEY, and
// chunking must not be duplicated in a second implementation. The original file
// is uploaded to Storage by the client; this function only records its path.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateEmbeddings } from "../_shared/embeddings.ts";
import {
  cleanText,
  semanticChunk,
  sha256Hex,
} from "../_shared/chunking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_TEXT_CHARS = 2_000_000; // ~2 MB of text per source
const MAX_CHUNKS = 2_000;
const INSERT_BATCH_SIZE = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Chunk {
  content: string;
  content_hash: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify the caller from their own JWT — the service-role client below
    // bypasses RLS, so ownership must be checked explicitly.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid or expired session" }, 401);

    const body = await req.json().catch(() => null);
    const chatbotId = typeof body?.chatbot_id === "string" ? body.chatbot_id : "";
    if (!UUID_RE.test(chatbotId)) return json({ error: "Invalid chatbot_id" }, 400);

    const sourceText = typeof body?.text === "string" ? body.text : "";
    if (!sourceText.trim()) return json({ error: "No text to train on" }, 400);
    if (sourceText.length > MAX_TEXT_CHARS) {
      return json(
        { error: "This source is too large. Split it into smaller parts." },
        413,
      );
    }

    const sourceType = body?.source_type === "file" ? "file" : "text";
    const title =
      typeof body?.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : sourceType === "file"
          ? "Uploaded file"
          : "Pasted text";
    const storagePath =
      typeof body?.storage_path === "string" && body.storage_path.trim()
        ? body.storage_path.trim().slice(0, 500)
        : null;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: bot, error: botError } = await supabase
      .from("chatbots")
      .select("id, user_id")
      .eq("id", chatbotId)
      .single();
    if (botError || !bot) return json({ error: "Chatbot not found" }, 404);
    if (bot.user_id !== user.id) return json({ error: "This bot is not yours" }, 403);

    const cleaned = cleanText(sourceText);
    // A titled one-liner is a legitimate source (short FAQ answers), so this is
    // a junk filter, not a length requirement.
    if (cleaned.length < 10) {
      return json(
        { error: "Not enough readable text to train on" },
        400,
      );
    }

    const documentHash = await sha256Hex(cleaned);

    // Same source, same bot → already indexed. Skip before paying for embeddings.
    const { data: existingDocument } = await supabase
      .from("training_documents")
      .select("*")
      .eq("chatbot_id", chatbotId)
      .eq("content_hash", documentHash)
      .maybeSingle();
    if (existingDocument) {
      return json({
        duplicate: true,
        document: existingDocument,
        chunks_created: 0,
        embedded: false,
      });
    }

    const pieces = semanticChunk(cleaned);
    if (pieces.length === 0) {
      return json({ error: "Could not extract any usable chunks from this source" }, 400);
    }
    if (pieces.length > MAX_CHUNKS) {
      return json(
        { error: "This source is too large. Split it into smaller parts." },
        413,
      );
    }

    const chunks: Chunk[] = [];
    const seenHashes = new Set<string>();
    for (const content of pieces) {
      const contentHash = await sha256Hex(content);
      if (seenHashes.has(contentHash)) continue;
      seenHashes.add(contentHash);
      chunks.push({ content, content_hash: contentHash });
    }

    const { data: document, error: documentError } = await supabase
      .from("training_documents")
      .insert({
        chatbot_id: chatbotId,
        source_type: sourceType,
        title,
        storage_path: storagePath,
        raw_text: sourceType === "text" ? cleaned : null,
        status: "ready",
        content_hash: documentHash,
        chunk_count: 0,
        char_count: cleaned.length,
      })
      .select("*")
      .single();

    if (documentError) {
      // Lost a race with a parallel identical upload → treat as duplicate.
      if (documentError.code === "23505") {
        const { data: raced } = await supabase
          .from("training_documents")
          .select("*")
          .eq("chatbot_id", chatbotId)
          .eq("content_hash", documentHash)
          .maybeSingle();
        return json({
          duplicate: true,
          document: raced,
          chunks_created: 0,
          embedded: false,
        });
      }
      return json({ error: documentError.message }, 500);
    }

    try {
      const openAiKey = Deno.env.get("OPENAI_API_KEY");
      let vectors: (number[] | null)[] = chunks.map(() => null);
      let embedded = false;

      if (openAiKey) {
        try {
          vectors = await generateEmbeddings(
            chunks.map((chunk) => chunk.content),
            openAiKey,
          );
          embedded = true;
        } catch (error) {
          // Keyword (FTS) retrieval still works without vectors; don't lose
          // the user's training data because one API call failed.
          console.error(
            "[ingest] embeddings failed, storing keyword-only chunks:",
            (error as Error).message,
          );
        }
      }

      let inserted = 0;
      for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
        const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
        const rows = batch.map((chunk, offset) => ({
          chatbot_id: chatbotId,
          document_id: document.id,
          title,
          content: chunk.content,
          content_hash: chunk.content_hash,
          embedding: vectors[i + offset] ?? null,
        }));

        const { error: chunkError } = await supabase
          .from("knowledge_chunks")
          .insert(rows);

        if (!chunkError) {
          inserted += rows.length;
          continue;
        }

        if (/CHUNK_QUOTA_EXCEEDED/.test(chunkError.message)) {
          await supabase.from("training_documents").delete().eq("id", document.id);
          return json(
            {
              code: "CHUNK_QUOTA_EXCEEDED",
              error: "CHUNK_QUOTA_EXCEEDED",
              message:
                "You have reached your plan's knowledge limit. Upgrade your plan to keep training this bot.",
            },
            403,
          );
        }

        // A hash collision with an existing chunk: insert row by row and skip
        // the ones that already exist instead of failing the whole source.
        if (chunkError.code === "23505") {
          for (const row of rows) {
            const { error: rowError } = await supabase
              .from("knowledge_chunks")
              .insert(row);
            if (!rowError) inserted++;
            else if (!/duplicate key/.test(rowError.message)) throw new Error(rowError.message);
          }
          continue;
        }

        throw new Error(chunkError.message);
      }

      const { data: updatedDocument, error: updateError } = await supabase
        .from("training_documents")
        .update({ chunk_count: inserted, status: "ready" })
        .eq("id", document.id)
        .select("*")
        .single();
      if (updateError) throw new Error(updateError.message);

      return json({
        duplicate: false,
        document: updatedDocument,
        chunks_created: inserted,
        embedded,
      });
    } catch (error) {
      // Never leave a half-indexed source behind — it would block retries via
      // the document hash and show a phantom row in the Sources panel.
      await supabase.from("training_documents").delete().eq("id", document.id);
      return json({ error: (error as Error).message ?? "Ingestion failed" }, 500);
    }
  } catch (error) {
    return json({ error: (error as Error).message ?? "Unexpected error" }, 500);
  }
});
