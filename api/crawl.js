import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { website_url } = req.body;

    if (!website_url) {
      return res.status(400).json({ error: "website_url is required" });
    }

    console.log(`Starting crawl for: ${website_url}`);

    // Load the website content
    const loader = new CheerioWebBaseLoader(website_url, {
      selector: "body",
    });
    
    const docs = await loader.load();
    
    if (!docs || docs.length === 0) {
      return res.json({
        success: false,
        status: "failed",
        message: "No content could be extracted from the website",
        pages_scanned: 0,
        chunks_created: 0,
      });
    }

    // Split content into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await textSplitter.splitDocuments(docs);
    
    // Format chunks for response
    const formattedChunks = chunks.map((chunk, index) => ({
      id: `chunk_${index}`,
      title: `Content chunk ${index + 1}`,
      content: chunk.pageContent,
      metadata: chunk.metadata,
    }));

    // Generate embeddings if OpenAI key is available
    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      try {
        const embeddings = new OpenAIEmbeddings({
          openAIApiKey: openAiKey,
        });

        for (const chunk of formattedChunks) {
          try {
            const embedding = await embeddings.embedQuery(chunk.content);
            chunk.embedding = embedding;
          } catch (err) {
            console.error(`Failed to generate embedding for chunk ${chunk.id}:`, err);
            chunk.embedding = null;
          }
        }
      } catch (err) {
        console.error("Failed to initialize OpenAI embeddings:", err);
      }
    }

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
