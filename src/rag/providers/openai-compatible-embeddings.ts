import type { DocumentEmbeddingProvider, EmbeddingProvider } from './embeddings';

// The OpenAI /embeddings endpoint accepts many inputs per call; we keep batches modest.
const MAX_INPUTS_PER_BATCH = 100;

export interface OpenAiCompatibleEmbeddingOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  // Sent to the server only when it is a number; otherwise the model's native size is used.
  dimensions: number | null | undefined;
  fetch?: typeof fetch;
}

export function createOpenAiCompatibleEmbeddingProvider(
  options: OpenAiCompatibleEmbeddingOptions,
): EmbeddingProvider & DocumentEmbeddingProvider {
  const { apiKey, model, dimensions } = options;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const expectedDimensions = typeof dimensions === 'number' ? dimensions : null;

  async function requestBatch(inputs: string[]): Promise<number[][]> {
    const doFetch = options.fetch ?? globalThis.fetch;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const body: Record<string, unknown> = { model, input: inputs };
    if (expectedDimensions !== null) body.dimensions = expectedDimensions;

    const response = await doFetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `Embeddings request failed with HTTP ${response.status}: ${await readErrorMessage(response, apiKey)}`,
      );
    }

    const data = (await response.json()) as { data?: Array<{ index?: number; embedding?: unknown }> };
    const items = data?.data;
    if (!Array.isArray(items) || items.length !== inputs.length) {
      throw new Error(
        `Embeddings server returned ${Array.isArray(items) ? items.length : 0} vectors for ${inputs.length} inputs`,
      );
    }
    const ordered = items
      .map((item, position) => ({ item, position }))
      .sort((a, b) => (a.item?.index ?? a.position) - (b.item?.index ?? b.position));
    return ordered.map(({ item }) => toUnitVector(item?.embedding, expectedDimensions));
  }

  async function embedMany(texts: readonly string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += MAX_INPUTS_PER_BATCH) {
      vectors.push(...(await requestBatch(texts.slice(start, start + MAX_INPUTS_PER_BATCH))));
    }
    const size = vectors[0]?.length;
    if (vectors.some((vector) => vector.length !== size)) {
      throw new Error('Embeddings server returned vectors with different sizes');
    }
    return vectors;
  }

  return {
    async embed(text) {
      const [vector] = await embedMany([text]);
      return vector;
    },
    embedDocuments: embedMany,
  };
}

// Cosine similarity needs unit vectors, and not every server normalizes them.
function toUnitVector(values: unknown, expectedDimensions: number | null): number[] {
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('Embeddings server returned an embedding without numeric values');
  }
  if (expectedDimensions !== null && values.length !== expectedDimensions) {
    throw new Error(
      `Embeddings server returned a vector with the wrong size: expected ${expectedDimensions} values, got ${values.length}`,
    );
  }
  const length = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  if (length === 0) throw new Error('Embeddings server returned a zero vector, which cannot be normalized');
  return values.map((v) => v / length);
}

async function readErrorMessage(response: Response, apiKey: string): Promise<string> {
  let message = response.statusText || 'no error message';
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text)?.error;
      message = (typeof parsed === 'string' ? parsed : parsed?.message) ?? text;
    } catch {
      message = text || message;
    }
  } catch {
    // Keep the status text when the body cannot be read.
  }
  const safe = String(message);
  return apiKey ? safe.split(apiKey).join('[redacted]') : safe;
}
