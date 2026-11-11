import type { DocumentRepository } from '../db/contracts';

export type DeleteDocumentResult =
  | { status: 'deleted' }
  | { status: 'not_found'; reason: string }
  | { status: 'error'; reason: string };

const NOT_FOUND_REASON = 'El documento no existe o ya fue eliminado.';
const ERROR_REASON = 'No se pudo eliminar el documento. No se borró nada; inténtalo de nuevo.';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteDocument(
  documentId: string,
  documents: Pick<DocumentRepository, 'delete'>,
): Promise<DeleteDocumentResult> {
  // Rejecting malformed ids here avoids a PostgreSQL uuid cast error.
  if (!UUID_PATTERN.test(documentId)) {
    return { status: 'not_found', reason: NOT_FOUND_REASON };
  }

  try {
    const deleted = await documents.delete(documentId);
    return deleted ? { status: 'deleted' } : { status: 'not_found', reason: NOT_FOUND_REASON };
  } catch {
    // The repository rolls back its transaction; the internal error is not exposed.
    return { status: 'error', reason: ERROR_REASON };
  }
}
