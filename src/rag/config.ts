// Experimental RAG parameters (T25). The defaults are visible here and documented in
// docs/specs/001-meai-mvp/spec.md; each one can be changed through an environment variable.
export interface RagConfig {
  // Characters per chunk.
  chunkSize: number;
  // Characters shared by consecutive chunks of the same page.
  chunkOverlap: number;
  // Number of chunks retrieved for each question.
  retrievalTopK: number;
}

export const DEFAULT_RAG_CONFIG: RagConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  retrievalTopK: 5,
};

type Environment = Readonly<Record<string, string | undefined>>;

function readInteger(env: Environment, name: string, fallback: number, minimum: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}; received "${raw}".`);
  }
  return value;
}

export function loadRagConfig(env: Environment = process.env): RagConfig {
  const chunkSize = readInteger(env, 'CHUNK_SIZE', DEFAULT_RAG_CONFIG.chunkSize, 1);
  const chunkOverlap = readInteger(env, 'CHUNK_OVERLAP', DEFAULT_RAG_CONFIG.chunkOverlap, 0);
  const retrievalTopK = readInteger(env, 'RETRIEVAL_TOP_K', DEFAULT_RAG_CONFIG.retrievalTopK, 1);
  if (chunkOverlap >= chunkSize) {
    throw new Error(
      `CHUNK_OVERLAP (${chunkOverlap}) must be smaller than CHUNK_SIZE (${chunkSize}).`,
    );
  }
  return { chunkSize, chunkOverlap, retrievalTopK };
}
