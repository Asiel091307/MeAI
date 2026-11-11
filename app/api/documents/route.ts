import type { NextResponse } from 'next/server';
import {
  handleDefaultGetDocuments,
  type ListDocumentsResponseBody,
} from './list-documents-handler';
import {
  handleDefaultPostDocument,
  type PostDocumentResponse,
} from './post-document-handler';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<ListDocumentsResponseBody | { error: string }>> {
  return handleDefaultGetDocuments();
}

export async function POST(request: Request): Promise<NextResponse<PostDocumentResponse>> {
  return handleDefaultPostDocument(request);
}
