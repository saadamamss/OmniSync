// Shared embedding generation for all Edge Functions.
// ⚠️ Every place that creates or queries embeddings MUST use the same model —
// vectors from different models don't belong to the same semantic space and
// will produce garbage similarity scores.

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions
export const EMBEDDING_DIMENSIONS = 1536;

// OpenAI accepts an array of inputs per request. Batching keeps training fast
// (one round-trip per 64 chunks) without hitting the per-request token limits,
// since a single chunk is ~350 tokens.
const EMBEDDING_BATCH_SIZE = 64;

export async function generateEmbeddings(
  contents: string[],
  openAiKey: string,
): Promise<number[][]> {
  const vectors: number[][] = [];

  for (let i = 0; i < contents.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = contents.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch.map((content) => content.slice(0, 8000)),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI embeddings failed (${response.status}): ${await response.text()}`,
      );
    }

    const data = await response.json();
    const batchVectors = [...(data.data ?? [])]
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);

    if (batchVectors.length !== batch.length) {
      throw new Error(
        `OpenAI returned ${batchVectors.length} embeddings for ${batch.length} inputs`,
      );
    }

    vectors.push(...batchVectors);
  }

  return vectors;
}

export async function generateEmbedding(
  content: string,
  openAiKey: string,
): Promise<number[]> {
  const [vector] = await generateEmbeddings([content], openAiKey);
  return vector;
}
