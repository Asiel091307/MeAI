import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import type { DocumentRepository } from '../../../src/db/contracts';
import { createPostgresDocumentRepository } from '../../../src/db/postgres-documents';
import { registerDocument } from '../../../src/documents/register-document';
import { startDocumentProcessingInBackground } from '../../../src/documents/start-document-processing';
import {
  type PublicDocumentItem,
  toPublicDocumentItem,
} from './list-documents-handler';

export const NO_FILE_PROVIDED_ERROR = 'No se ha proporcionado ningún archivo para registrar.';

export type PostDocumentResponse =
  | { document: PublicDocumentItem }
  | { error: string };

let defaultPool: Pool | null = null;
let testRepositoryOverride: Pick<DocumentRepository, 'create'> | null = null;

function getDefaultDocumentCreateRepository(): Pick<DocumentRepository, 'create'> {
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

export function setDocumentPostRepositoryForTesting(
  repository: Pick<DocumentRepository, 'create'> | null,
): void {
  testRepositoryOverride = repository;
}

// Starts processing a registered document without making the upload wait for it.
export type StartDocumentProcessing = (documentId: string) => void;

const startInBackground: StartDocumentProcessing = (documentId) => {
  void startDocumentProcessingInBackground(documentId);
};

export function createPostDocumentHandler(
  documents: Pick<DocumentRepository, 'create'>,
  startProcessing: StartDocumentProcessing = () => {},
) {
  return async function handlePostDocument(request: Request): Promise<NextResponse<PostDocumentResponse>> {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: NO_FILE_PROVIDED_ERROR }, { status: 400 });
    }

    const file = formData.get('file') ?? formData.get('pdf');
    if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
      return NextResponse.json({ error: NO_FILE_PROVIDED_ERROR }, { status: 400 });
    }

    const name = (file as File).name || 'documento.pdf';
    const buffer = await (file as Blob).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const result = await registerDocument(documents, { name, bytes });
    if (!result.registered) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    // A PDF already registered as failed (damaged or protected) has nothing to process.
    if (result.document.status === 'processing') {
      startProcessing(result.document.id);
    }

    return NextResponse.json(
      { document: toPublicDocumentItem(result.document) },
      { status: 201 },
    );
  };
}

export async function handleDefaultPostDocument(
  request: Request,
): Promise<NextResponse<PostDocumentResponse>> {
  const repository = getDefaultDocumentCreateRepository();
  // With a test repository there is no real database to process against.
  const startProcessing = testRepositoryOverride ? () => {} : startInBackground;
  return createPostDocumentHandler(repository, startProcessing)(request);
}

