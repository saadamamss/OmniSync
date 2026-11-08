// Shared embedding generation for all Edge Functions.
// ⚠️ Every place that creates or queries embeddings MUST use the same model —
// vectors from different models don't belong to the same semantic space and
// will produce garbage similarity scores.

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions

export async function generateEmbedding(
  content: string,
  openAiKey: string,
): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: content,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI embeddings failed (${response.status}): ${await response.text()}`,
    );
  }

  const data = await response.json();
  return data.data[0].embedding;
}
