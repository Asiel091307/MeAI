import { getPool } from '../db/pool';
import { createPostgresChunkRepository } from '../db/postgres-chunks';
import { createPostgresDocumentRepository } from '../db/postgres-documents';
import { createPostgresPublicationRepository } from '../db/postgres-publication';
import { createPostgresVersionRepository } from '../db/postgres-versions';
import { loadRagConfig } from '../rag/config';
import { loadAiConfig } from '../rag/providers/ai-config';
import { loadGeminiEmbeddingProvider } from '../rag/providers/gemini-embeddings';
import { processDocument } from './process-document';

// Processes a registered document with the real database and the approved Gemini embeddings.
async function processWithDefaultDependencies(documentId: string): Promise<void> {
  const pool = getPool();
  await processDocument(documentId, {
    documents: createPostgresDocumentRepository(pool),
    versions: createPostgresVersionRepository(pool),
    chunks: createPostgresChunkRepository(pool),
    publication: createPostgresPublicationRepository(pool),
    embeddings: loadGeminiEmbeddingProvider(),
    embeddingModel: loadAiConfig().embedding.model,
    config: loadRagConfig(),
  });
}

// The upload answers right away (201, 'processing'); reading, OCR and embeddings run afterwards.
// Expected failures already end as 'failed' inside processDocument. Anything unexpected (for
// example the database being down) is only logged here; a restart recovers it (T32).
export async function startDocumentProcessingInBackground(
  documentId: string,
  run: (documentId: string) => Promise<void> = processWithDefaultDependencies,
): Promise<void> {
  try {
    await run(documentId);
  } catch (error) {
    console.error(`Background processing of document ${documentId} failed:`, error);
  }
}
