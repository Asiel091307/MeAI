import { NextResponse } from 'next/server';
import type { DocumentReprocessingRepository } from '../../../../../src/db/contracts';
import { getPool } from '../../../../../src/db/pool';
import { createPostgresReprocessingRepository } from '../../../../../src/db/postgres-reprocessing';
import { startDocumentProcessingInBackground } from '../../../../../src/documents/start-document-processing';
import {
  type DependentQueryCoordinator,
  defaultDependentQueryCoordinator,
} from '../../../../../src/rag/answering/dependent-query-cancellation';
import type { RouteContextWithId } from '../delete-document-handler';

const NOT_FOUND_REASON = 'El documento no existe o ya fue eliminado.';
const ALREADY_PROCESSING_REASON = 'El documento ya se está procesando. Espera a que termine.';

let testRepositoryOverride: DocumentReprocessingRepository | null = null;

export function setDocumentReprocessRepositoryForTesting(
  repository: DocumentReprocessingRepository | null,
): void {
  testRepositoryOverride = repository;
}

export function createReprocessDocumentHandler(
  reprocessing: DocumentReprocessingRepository,
  startProcessing: (documentId: string) => void = () => {},
  coordinator: DependentQueryCoordinator = defaultDependentQueryCoordinator,
) {
  return async function handleReprocessDocument(
    _request: Request,
    context: RouteContextWithId,
  ): Promise<Response> {
    const resolvedParams = await Promise.resolve(context.params);
    const documentId = resolvedParams?.id ?? '';

    const started = await reprocessing.startReprocessing(documentId);

    if (started === 'not_found') {
      return NextResponse.json({ error: NOT_FOUND_REASON }, { status: 404 });
    }

    if (started === 'already_processing') {
      return NextResponse.json({ error: ALREADY_PROCESSING_REASON }, { status: 409 });
    }

    coordinator.notifyDocumentReprocessing(documentId);
    startProcessing(documentId);

    return NextResponse.json(
      {
        document: {
          id: documentId,
          status: 'processing',
        },
      },
      { status: 202 },
    );
  };
}

export async function handleDefaultReprocessDocument(
  request: Request,
  context: RouteContextWithId,
): Promise<Response> {
  const repository =
    testRepositoryOverride ?? createPostgresReprocessingRepository(getPool());
  const startProcessing = testRepositoryOverride
    ? () => {}
    : (documentId: string) => {
        void startDocumentProcessingInBackground(documentId);
      };

  return createReprocessDocumentHandler(repository, startProcessing)(request, context);
}
