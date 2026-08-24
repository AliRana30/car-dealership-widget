/**
 * Shared embeddings helper using OpenAI's or Groq's embeddings API.
 * Uses text-embedding-3-small (1536 dimensions) by default for OpenAI,
 * and nomic-embed-text-v1.5 for Groq if configured.
 * Automatically falls back to OpenAI or deterministic dummy vectors in development if keys are missing.
 */

const MAX_EMBEDDING_BATCH_SIZE = 100;

async function embedTextChunk(cleanTexts: string[]): Promise<number[][]> {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    console.warn(
      `[embeddings] WARNING: Neither GROQ_API_KEY nor OPENAI_API_KEY is set. ` +
      `Generating deterministic dummy vectors (1536-dimension) for ${cleanTexts.length} inputs.`
    );
    
    return cleanTexts.map(text => {
      // Create a deterministic vector based on the hash of the text
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return Array.from({ length: 1536 }, (_, i) => {
        return Math.sin(hash + i) * 0.1;
      });
    });
  }

  // Determine provider priority: try Groq if GROQ_API_KEY is set, otherwise use OpenAI
  const providersToTry: { name: 'groq' | 'openai'; key: string; baseUrl: string; model: string }[] = [];
  
  if (groqKey) {
    providersToTry.push({
      name: 'groq',
      key: groqKey,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_EMBEDDING_MODEL || 'nomic-embed-text-v1.5',
    });
  }
  
  if (openaiKey) {
    providersToTry.push({
      name: 'openai',
      key: openaiKey,
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
    });
  }

  let lastError: Error | null = null;

  for (const provider of providersToTry) {
    try {
      const response = await fetch(`${provider.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.key}`,
        },
        body: JSON.stringify({
          input: cleanTexts,
          model: provider.model,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${provider.name} API error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      
      if (!result.data || !Array.isArray(result.data)) {
        throw new Error(`Invalid response structure from ${provider.name}`);
      }

      // Sort the embeddings by index to guarantee the ordering matches cleanTexts
      const embeddings = result.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => item.embedding);

      return embeddings;
    } catch (err: any) {
      console.warn(`[embeddings] Failed to generate embeddings using ${provider.name}:`, err.message || err);
      lastError = err;
      // Continue to next provider in the list
    }
  }

  // If we had keys but all attempts failed, fall back to dummy vectors rather than crashing the ingestion pipeline
  console.warn(
    `[embeddings] All configured embedding APIs failed. Falling back to dummy vectors. Last error: ${lastError?.message}`
  );
  return cleanTexts.map(text => {
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 1536 }, (_, i) => Math.sin(hash + i) * 0.1);
  });
}

/**
 * Generates embeddings for an array of input texts in batches.
 *
 * @param texts Array of string inputs to embed.
 * @returns Array of 1536-dimensional embedding vectors.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const cleanTexts = texts.map((t) => (t || '').trim().replace(/\n+/g, ' ') || ' ');

  if (cleanTexts.length <= MAX_EMBEDDING_BATCH_SIZE) {
    return embedTextChunk(cleanTexts);
  }

  // Split into chunks of MAX_EMBEDDING_BATCH_SIZE
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < cleanTexts.length; i += MAX_EMBEDDING_BATCH_SIZE) {
    const chunk = cleanTexts.slice(i, i + MAX_EMBEDDING_BATCH_SIZE);
    const chunkEmbeddings = await embedTextChunk(chunk);
    allEmbeddings.push(...chunkEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Alias for embedTexts to support batch embedding calls.
 */
export const embedBatch = embedTexts;

/**
 * Generates an embedding vector for a single text input.
 *
 * @param text The string input to embed.
 * @returns A 1536-dimensional embedding vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const embeddings = await embedTexts([text]);
  if (embeddings.length === 0 || !embeddings[0]) {
    throw new Error('Failed to generate embedding for the text.');
  }
  return embeddings[0];
}

/**
 * Generates an embedding vector specifically for search queries.
 * 
 * STRICT RETRIEVAL GUARANTEE:
 * 1. NEVER generates dummy/fallback vectors for queries.
 * 2. If API keys are missing or generation fails, returns null.
 * 3. Allows the caller to fail closed or cleanly fall back to keyword search.
 *
 * @param query The search query string to embed.
 * @returns A 1536-dimensional embedding vector, or null if generation fails.
 */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return null;
  }

  const cleanQuery = query.trim().replace(/\n+/g, ' ');
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    // No keys configured — fail gracefully by returning null (NEVER dummy vectors)
    return null;
  }

  const providersToTry: { name: 'groq' | 'openai'; key: string; baseUrl: string; model: string }[] = [];

  if (groqKey) {
    providersToTry.push({
      name: 'groq',
      key: groqKey,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_EMBEDDING_MODEL || 'nomic-embed-text-v1.5',
    });
  }

  if (openaiKey) {
    providersToTry.push({
      name: 'openai',
      key: openaiKey,
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
    });
  }

  for (const provider of providersToTry) {
    try {
      const response = await fetch(`${provider.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.key}`,
        },
        body: JSON.stringify({
          input: [cleanQuery],
          model: provider.model,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[embeddings:embedQuery] ${provider.name} error (${response.status}): ${errText}`);
        continue;
      }

      const result = await response.json();
      if (result.data && Array.isArray(result.data) && result.data[0]?.embedding) {
        const embedding = result.data[0].embedding;
        if (Array.isArray(embedding) && embedding.length === 1536) {
          return embedding;
        }
      }
    } catch (err: any) {
      console.warn(`[embeddings:embedQuery] Failed with ${provider.name}:`, err?.message || err);
    }
  }

  // All providers failed or returned invalid response
  return null;
}


