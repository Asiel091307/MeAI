import type { DocumentRepository } from '../db/contracts';
import type { DocumentFileResult } from './document-file';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDocumentFile(
  documentId: string,
  documents: Pick<DocumentRepository, 'findById'>,
): Promise<DocumentFileResult> {
  // Rejecting malformed ids here avoids a PostgreSQL uuid cast error.
  if (!UUID_PATTERN.test(documentId)) {
    return { status: 'not_found' };
  }

  // Repository errors are not caught here: the route turns them into a Spanish 500.
  const document = await documents.findById(documentId);
  if (!document) {
    return { status: 'not_found' };
  }

  // Any status is served: the user's PDF is viewable even if it is not queryable.
  return { status: 'found', name: document.name, bytes: document.pdfBytes };
}
