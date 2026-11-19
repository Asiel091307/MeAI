import { NextResponse } from 'next/server';
import type { DocumentRepository } from '../../../../src/db/contracts';
import { getPool } from '../../../../src/db/pool';
import { createPostgresDocumentRepository } from '../../../../src/db/postgres-documents';
import { deleteDocument } from '../../../../src/documents/delete-document';
import {
  type DependentQueryCoordinator,
  defaultDependentQueryCoordinator,
} from '../../../../src/rag/answering/dependent-query-cancellation';

export interface RouteContextWithId {
  params: Promise<{ id: string }> | { id: string };
}

// What Next.js 15 passes to a dynamic route at build time: params is always a promise.
export interface NextRouteContextWithId {
  params: Promise<{ id: string }>;
}

let testRepositoryOverride: Pick<DocumentRepository, 'delete'> | null = null;

export function setDocumentDeleteRepositoryForTesting(
  repository: Pick<DocumentRepository, 'delete'> | null,
): void {
  testRepositoryOverride = repository;
}

export function createDeleteDocumentHandler(
  documents: Pick<DocumentRepository, 'delete'>,
  coordinator: DependentQueryCoordinator = defaultDependentQueryCoordinator,
) {
  return async function handleDeleteDocument(
    _request: Request,
    context: RouteContextWithId,
  ): Promise<Response> {
    const resolvedParams = await Promise.resolve(context.params);
    const documentId = resolvedParams?.id ?? '';

    const result = await deleteDocument(documentId, documents);

    if (result.status === 'deleted') {
      coordinator.notifyDocumentDeleted(documentId);
      return new Response(null, { status: 204 });
    }

    if (result.status === 'not_found') {
      return NextResponse.json({ error: result.reason }, { status: 404 });
    }

    return NextResponse.json({ error: result.reason }, { status: 500 });
  };
}

export async function handleDefaultDeleteDocument(
  request: Request,
  context: RouteContextWithId,
): Promise<Response> {
  const repository =
    testRepositoryOverride ?? createPostgresDocumentRepository(getPool());
  return createDeleteDocumentHandler(repository)(request, context);
}
