import { getPool } from '../../../../../src/db/pool';
import { createPostgresDocumentRepository } from '../../../../../src/db/postgres-documents';
import { getDocumentFile } from '../../../../../src/documents/get-document-file';
import type { NextRouteContextWithId } from '../delete-document-handler';
import { createGetDocumentFileHandler } from './file-handler';

export const dynamic = 'force-dynamic';

// GET /api/documents/:id/file serves the original PDF (spec 004, RF-004-5).
export async function GET(request: Request, context: NextRouteContextWithId): Promise<Response> {
  const documents = createPostgresDocumentRepository(getPool());
  return createGetDocumentFileHandler((id) => getDocumentFile(id, documents))(request, context);
}
