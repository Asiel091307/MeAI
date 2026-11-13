import { getPool } from '../../../../../src/db/pool';
import { createPostgresDocumentRepository } from '../../../../../src/db/postgres-documents';
import type { DocumentFileResult } from '../../../../../src/documents/document-file';
import type { RouteContextWithId } from '../delete-document-handler';
import { createGetDocumentFileHandler } from './file-handler';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// TODO(integrator): replace with getDocumentFile from src/documents/get-document-file.ts
async function findDocumentFile(id: string): Promise<DocumentFileResult> {
  // Rejecting malformed ids avoids a PostgreSQL uuid cast error.
  if (!UUID_PATTERN.test(id)) return { status: 'not_found' };
  const document = await createPostgresDocumentRepository(getPool()).findById(id);
  if (!document) return { status: 'not_found' };
  return { status: 'found', name: document.name, bytes: document.pdfBytes };
}

export async function GET(request: Request, context: RouteContextWithId): Promise<Response> {
  return createGetDocumentFileHandler((id) => findDocumentFile(id))(request, context);
}
