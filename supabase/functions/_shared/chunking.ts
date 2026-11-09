// Pure text-processing helpers for the ingestion pipeline.
// Kept free of Deno/HTTP imports so the behaviour can be exercised directly.

// ~350 tokens ≈ 260 words for mixed English/Arabic prose.
export const TARGET_WORDS = 260;
export const MIN_WORDS = 10;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Conservative normalization: keep the author's words, drop formatting noise
// that PDF extraction leaves behind (page numbers, separator lines, NBSP).
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length === 0 || !/^[\d\s\-–—_=•·|/\\]+$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(block: string): string[] {
  return block
    .split(/(?<=[.!?؟…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sliceByWords(text: string, wordsPerSlice: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const slices: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerSlice) {
    slices.push(words.slice(i, i + wordsPerSlice).join(" "));
  }
  return slices;
}

// Split at paragraph boundaries, falling back to sentences (and finally a hard
// word slice for pathological input) so each chunk represents one idea.
export function semanticChunk(text: string): string[] {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  const flush = () => {
    const content = current.join("\n\n").trim();
    if (content) chunks.push(content);
    current = [];
    currentWords = 0;
  };

  const push = (piece: string) => {
    const words = countWords(piece);
    if (!words) return;
    if (currentWords > 0 && currentWords + words > TARGET_WORDS) flush();
    current.push(piece);
    currentWords += words;
  };

  for (const block of blocks) {
    if (countWords(block) <= TARGET_WORDS) {
      push(block);
      continue;
    }
    for (const sentence of splitSentences(block)) {
      if (countWords(sentence) <= TARGET_WORDS) {
        push(sentence);
      } else {
        for (const slice of sliceByWords(sentence, TARGET_WORDS)) push(slice);
      }
    }
  }
  flush();

  // Fold a tiny trailing fragment into its predecessor instead of indexing a
  // chunk that is too short to retrieve anything useful.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    if (countWords(last) < MIN_WORDS) {
      const merged = `${chunks[chunks.length - 2]}\n\n${last}`;
      if (countWords(merged) <= TARGET_WORDS * 1.5) {
        chunks.splice(chunks.length - 2, 2, merged);
      }
    }
  }

  return chunks;
}
