import type {
  ChunkRepository,
  DocumentPublicationRepository,
  DocumentRepository,
  DocumentVersionRepository,
} from '../db/contracts';
import type { RagConfig } from '../rag/config';
import { chunkPages } from '../rag/ingestion/chunker';
import { PdfDamagedError, PdfProtectedError } from '../rag/ingestion/pdf-page-count';
import { extractPdfPageTexts } from '../rag/ingestion/pdf-page-texts';
import { ensureReadablePages } from '../rag/ingestion/readable-pages';
import type { DocumentEmbeddingProvider } from '../rag/providers/embeddings';
import type { OcrProvider } from '../rag/providers/ocr';

export interface ProcessDocumentDeps {
  documents: Pick<DocumentRepository, 'findById'>;
  versions: DocumentVersionRepository;
  chunks: Pick<ChunkRepository, 'save'>;
  publication: Pick<DocumentPublicationRepository, 'publish' | 'fail'>;
  embeddings: DocumentEmbeddingProvider;
  config: RagConfig;
  ocr?: OcrProvider;
}

export type ProcessDocumentResult = { status: 'available' } | { status: 'failed'; reason: string };

const EMBEDDINGS_FAILED_REASON =
  'No se pudieron generar los embeddings del documento. Inténtalo de nuevo más tarde.';
const GENERIC_FAILED_REASON = 'El procesamiento del documento falló. Inténtalo de nuevo.';

// An error whose message is already safe and understandable for the user.
class ProcessingFailure extends Error {}

// Only these messages reach the user: they never contain stack traces or secrets.
function toUserReason(error: unknown): string {
  if (
    error instanceof ProcessingFailure ||
    error instanceof PdfDamagedError ||
    error instanceof PdfProtectedError
  ) {
    return error.message;
  }
  return GENERIC_FAILED_REASON;
}

async function embedChunkTexts(
  embeddings: DocumentEmbeddingProvider,
  texts: readonly string[],
): Promise<ReadonlyArray<readonly number[]>> {
  let vectors: ReadonlyArray<readonly number[]>;
  try {
    vectors = await embeddings.embedDocuments(texts);
  } catch {
    throw new ProcessingFailure(EMBEDDINGS_FAILED_REASON);
  }
  if (vectors.length !== texts.length) {
    throw new ProcessingFailure(EMBEDDINGS_FAILED_REASON);
  }
  return vectors;
}

// Reads, chunks, embeds and publishes a document as a new version.
// Nothing is queryable until publish(); any failure discards the attempt.
export async function processDocument(
  documentId: string,
  deps: ProcessDocumentDeps,
): Promise<ProcessDocumentResult> {
  const document = await deps.documents.findById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} does not exist.`);
  }

  const version = await deps.versions.create(documentId);
  try {
    const pages = await extractPdfPageTexts(document.pdfBytes, { ocr: deps.ocr });

    const readable = ensureReadablePages(pages);
    if (!readable.readable) {
      throw new ProcessingFailure(readable.reason);
    }

    const drafts = chunkPages(documentId, pages, {
      chunkSize: deps.config.chunkSize,
      overlap: deps.config.chunkOverlap,
    });
    const vectors = await embedChunkTexts(
      deps.embeddings,
      drafts.map(({ text }) => text),
    );

    await deps.chunks.save(
      documentId,
      version.id,
      drafts.map(({ page, position, text }, index) => ({
        page,
        position,
        text,
        embedding: vectors[index],
      })),
    );
    await deps.publication.publish(documentId, version.id);
    return { status: 'available' };
  } catch (error) {
    const reason = toUserReason(error);
    await deps.publication.fail(documentId, version.id, reason);
    return { status: 'failed', reason };
  }
}
