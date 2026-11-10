import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import type { DocumentMetadata, DocumentRepository, DocumentStatus } from '../../../src/db/contracts';
import { createPostgresDocumentRepository } from '../../../src/db/postgres-documents';

export const EMPTY_DOCUMENTS_MESSAGE =
  'Aún no hay documentos incorporados. Sube tu primer PDF para comenzar.';

export interface PublicDocumentItem {
  id: string;
  name: string;
  status: DocumentStatus;
  error: string | null;
  activeVersionId: string | null;
  createdAt: string;
}

export interface ListDocumentsResponseBody {
  documents: PublicDocumentItem[];
  message: string | null;
}

let defaultPool: Pool | null = null;
let testRepositoryOverride: Pick<DocumentRepository, 'list'> | null = null;

function getDefaultDocumentListRepository(): Pick<DocumentRepository, 'list'> {
  if (testRepositoryOverride) {
    return testRepositoryOverride;
  }
  if (!defaultPool) {
    defaultPool = new Pool({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'meai',
      user: process.env.DB_USER ?? 'meai',
      password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD,
    });
  }
  return createPostgresDocumentRepository(defaultPool);
}

export function setDocumentListRepositoryForTesting(
  repository: Pick<DocumentRepository, 'list'> | null,
): void {
  testRepositoryOverride = repository;
}

export function toPublicDocumentItem(doc: DocumentMetadata): PublicDocumentItem {
  return {
    id: doc.id,
    name: doc.name,
    status: doc.status,
    error: doc.error,
    activeVersionId: doc.activeVersionId,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
  };
}

export function createGetDocumentsHandler(documents: Pick<DocumentRepository, 'list'>) {
  return async function handleGetDocuments(): Promise<NextResponse<ListDocumentsResponseBody>> {
    const items = await documents.list();
    const publicDocuments = items.map(toPublicDocumentItem);

    return NextResponse.json(
      {
        documents: publicDocuments,
        message: publicDocuments.length === 0 ? EMPTY_DOCUMENTS_MESSAGE : null,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  };
}

export async function handleDefaultGetDocuments(): Promise<NextResponse<ListDocumentsResponseBody>> {
  const repository = getDefaultDocumentListRepository();
  return createGetDocumentsHandler(repository)();
}

