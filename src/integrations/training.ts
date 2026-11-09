import { supabase } from "@/integrations/supabase/client";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const TRAINING_BUCKET = "training-files";

export type TrainingSourceType = "text" | "file";

export interface TrainingDocument {
  id: string;
  chatbot_id: string;
  source_type: TrainingSourceType;
  title: string;
  storage_path: string | null;
  status: "ready" | "failed";
  chunk_count: number;
  char_count: number;
  created_at: string;
}

export interface IngestResult {
  duplicate: boolean;
  document: TrainingDocument | null;
  chunksCreated: number;
  embedded: boolean;
}

export type TrainingErrorCode =
  | "CHUNK_QUOTA_EXCEEDED"
  | "STORAGE_FAILED"
  | "UNAUTHENTICATED"
  | "INGEST_FAILED";

export class TrainingError extends Error {
  code: TrainingErrorCode;

  constructor(message: string, code: TrainingErrorCode = "INGEST_FAILED") {
    super(message);
    this.name = "TrainingError";
    this.code = code;
  }
}

async function readFunctionError(error: unknown): Promise<any> {
  const context = (error as any)?.context;
  if (context && typeof context.json === "function") {
    try {
      return await context.json();
    } catch {
      // Response body already consumed or not JSON.
    }
  }
  return {};
}

/** Client-side PDF text extraction. Scanned PDFs return no usable text. */
export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item: any) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return pages.filter(Boolean).join("\n\n");
}

/** Stores the original file so knowledge can be rebuilt without re-uploading. */
export async function uploadTrainingFile(botId: string, file: File): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new TrainingError("Please sign in again.", "UNAUTHENTICATED");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${user.id}/${botId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(TRAINING_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new TrainingError(
      `Could not store the original file: ${error.message}`,
      "STORAGE_FAILED",
    );
  }
  return path;
}

export async function removeTrainingFile(path: string): Promise<void> {
  await supabase.storage.from(TRAINING_BUCKET).remove([path]);
}

export interface IngestInput {
  botId: string;
  title: string;
  sourceType: TrainingSourceType;
  text: string;
  storagePath?: string | null;
}

/** Sends text to the ingestion Edge Function: clean → chunk → hash → embed → store. */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const { data, error } = await supabase.functions.invoke("ingest", {
    body: {
      chatbot_id: input.botId,
      title: input.title,
      source_type: input.sourceType,
      text: input.text,
      storage_path: input.storagePath ?? null,
    },
  });

  if (error) {
    const payload = await readFunctionError(error);
    const message =
      payload.message ||
      payload.error ||
      (error instanceof Error ? error.message : null) ||
      "Training failed";

    if (/CHUNK_QUOTA_EXCEEDED/.test(message) || payload.code === "CHUNK_QUOTA_EXCEEDED") {
      throw new TrainingError(message, "CHUNK_QUOTA_EXCEEDED");
    }
    throw new TrainingError(message);
  }

  if (!data) throw new TrainingError("Training failed: empty response from server");

  return {
    duplicate: Boolean(data.duplicate),
    document: (data.document as TrainingDocument) ?? null,
    chunksCreated: Number(data.chunks_created ?? 0),
    embedded: Boolean(data.embedded),
  };
}

export async function fetchTrainingDocuments(
  botId: string,
): Promise<TrainingDocument[]> {
  const { data, error } = await supabase
    .from("training_documents")
    .select(
      "id, chatbot_id, source_type, title, storage_path, status, chunk_count, char_count, created_at",
    )
    .eq("chatbot_id", botId)
    .order("created_at", { ascending: false });

  if (error) throw new TrainingError(error.message);

  return (data ?? []).map((doc: any) => ({
    ...doc,
    chunk_count: Number(doc.chunk_count ?? 0),
    char_count: Number(doc.char_count ?? 0),
  }));
}

/** Deleting a source cascades to its chunks; the stored original goes too. */
export async function deleteTrainingDocument(document: TrainingDocument): Promise<void> {
  const { error } = await supabase
    .from("training_documents")
    .delete()
    .eq("id", document.id);

  if (error) throw new TrainingError(error.message);

  if (document.storage_path) {
    await removeTrainingFile(document.storage_path).catch(() => undefined);
  }
}
