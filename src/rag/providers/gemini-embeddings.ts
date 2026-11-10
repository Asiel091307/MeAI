import type { DocumentEmbeddingProvider, EmbeddingProvider } from './embeddings';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-embedding-001';
const DEFAULT_DIMENSIONS = 1536;

// batchEmbedContents accepts at most 100 requests per call.
const MAX_REQUESTS_PER_BATCH = 100;

type TaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';

export interface GeminiEmbeddingOptions {
  apiKey: string;
  model: string;
  dimensions: number;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export function createGeminiEmbeddingProvider(
  options: GeminiEmbeddingOptions,
): EmbeddingProvider & DocumentEmbeddingProvider {
  const { apiKey, model, dimensions } = options;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const modelPath = `models/${model}`;

  async function post(method: string, body: unknown): Promise<any> {
    const doFetch = options.fetch ?? globalThis.fetch;
    const response = await doFetch(`${baseUrl}/${modelPath}:${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `Gemini ${method} failed with HTTP ${response.status}: ${await readErrorMessage(response, apiKey)}`,
      );
    }
    return response.json();
  }

  function buildRequest(text: string, taskType: TaskType) {
    return {
      model: modelPath,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: dimensions,
    };
  }

  // Gemini does not normalize vectors shorter than 3072 values, so cosine similarity needs this.
  function toUnitVector(values: unknown): number[] {
    if (!Array.isArray(values) || !values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error('Gemini returned an embedding without numeric values');
    }
    if (values.length !== dimensions) {
      throw new Error(`Gemini returned a vector with the wrong size: expected ${dimensions} values, got ${values.length}`);
    }
    const length = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    if (length === 0) throw new Error('Gemini returned a zero vector, which cannot be normalized');
    return values.map((v) => v / length);
  }

  return {
    async embed(text) {
      const data = await post('embedContent', buildRequest(text, 'RETRIEVAL_QUERY'));
      return toUnitVector(data?.embedding?.values);
    },

    async embedDocuments(texts) {
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += MAX_REQUESTS_PER_BATCH) {
        const batch = texts.slice(start, start + MAX_REQUESTS_PER_BATCH);
        const data = await post('batchEmbedContents', {
          requests: batch.map((text) => buildRequest(text, 'RETRIEVAL_DOCUMENT')),
        });
        const embeddings = data?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
          throw new Error(
            `Gemini returned ${Array.isArray(embeddings) ? embeddings.length : 0} vectors for ${batch.length} inputs`,
          );
        }
        for (const embedding of embeddings) vectors.push(toUnitVector(embedding?.values));
      }
      return vectors;
    },
  };
}

async function readErrorMessage(response: Response, apiKey: string): Promise<string> {
  let message = response.statusText || 'no error message';
  try {
    const text = await response.text();
    try {
      message = JSON.parse(text)?.error?.message ?? text;
    } catch {
      message = text || message;
    }
  } catch {
    // Keep the status text when the body cannot be read.
  }
  return String(message).split(apiKey).join('[redacted]');
}

type Env = Record<string, string | undefined>;

export function loadGeminiEmbeddingProvider(
  env: Env = process.env,
): EmbeddingProvider & DocumentEmbeddingProvider {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required: set it in the environment (see .env.example)');
  }

  const provider = env.EMBEDDING_PROVIDER?.trim();
  if (provider && provider !== 'gemini') {
    throw new Error(`EMBEDDING_PROVIDER must be "gemini" for this adapter, got "${provider}"`);
  }

  const rawDimensions = env.EMBEDDING_DIMENSIONS?.trim();
  const dimensions = rawDimensions ? Number(rawDimensions) : DEFAULT_DIMENSIONS;
  if (rawDimensions && !/^\d+$/.test(rawDimensions) || !Number.isSafeInteger(dimensions) || dimensions <= 0) {
    throw new Error(`EMBEDDING_DIMENSIONS must be a positive integer, got "${rawDimensions}"`);
  }

  return createGeminiEmbeddingProvider({
    apiKey,
    model: env.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL,
    dimensions,
  });
}
